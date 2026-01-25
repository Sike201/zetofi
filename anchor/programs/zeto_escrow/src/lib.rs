use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("BY1HuoCGtM71JTNhpwP7vSfRoiZPfcosgMsaDbFRqJTo");

/// Fee basis points (0.20% = 20 bps) — paid by buyer (quote side) only
pub const FEE_BPS: u64 = 20;
pub const BPS_DENOMINATOR: u64 = 10000;

#[program]
pub mod zeto_escrow {
    use super::*;

    /// Initialize a new deal with terms. Status = Initialized.
    /// Seller must call deposit_base() next to fund the escrow.
    pub fn initialize_deal(
        ctx: Context<InitializeDeal>,
        deal_id: [u8; 32],
        base_amount: u64,
        quote_amount: u64,
        expiry_ts: i64,
    ) -> Result<()> {
        let deal = &mut ctx.accounts.deal;
        let clock = Clock::get()?;

        require!(expiry_ts > clock.unix_timestamp, ZetoError::ExpiryInPast);
        require!(base_amount > 0, ZetoError::InvalidAmount);
        require!(quote_amount > 0, ZetoError::InvalidAmount);

        deal.deal_id = deal_id;
        deal.seller = ctx.accounts.seller.key();
        deal.buyer = ctx.accounts.buyer.key();
        deal.base_mint = ctx.accounts.base_mint.key();
        deal.quote_mint = ctx.accounts.quote_mint.key();
        deal.base_amount = base_amount;
        deal.quote_amount = quote_amount;
        deal.expiry_ts = expiry_ts;
        deal.fee_bps = FEE_BPS as u16;
        deal.fee_recipient = ctx.accounts.fee_recipient.key();
        deal.status = DealStatus::Initialized;
        deal.created_at = clock.unix_timestamp;
        deal.bump = ctx.bumps.deal;

        emit!(DealInitialized {
            deal_id,
            seller: deal.seller,
            buyer: deal.buyer,
            base_mint: deal.base_mint,
            quote_mint: deal.quote_mint,
            base_amount,
            quote_amount,
            expiry_ts,
        });

        Ok(())
    }

    /// Seller deposits base tokens into the escrow vault. Status = Funded.
    pub fn deposit_base(ctx: Context<DepositBase>) -> Result<()> {
        let deal = &mut ctx.accounts.deal;

        require!(deal.status == DealStatus::Initialized, ZetoError::InvalidStatus);
        require!(ctx.accounts.seller.key() == deal.seller, ZetoError::Unauthorized);

        // Transfer base tokens from seller to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.seller_base_ata.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, deal.base_amount)?;

        deal.status = DealStatus::Funded;

        emit!(DealFunded {
            deal_id: deal.deal_id,
            seller: deal.seller,
            amount: deal.base_amount,
        });

        Ok(())
    }

    /// Buyer accepts and settles the deal atomically.
    /// - Buyer pays quote tokens to seller (minus 0.2% fee to fee recipient); seller pays no fee.
    /// - Vault sends full base tokens to buyer.
    pub fn accept_and_settle(ctx: Context<AcceptAndSettle>) -> Result<()> {
        let deal = &ctx.accounts.deal;
        let clock = Clock::get()?;

        require!(deal.status == DealStatus::Funded, ZetoError::InvalidStatus);
        require!(ctx.accounts.buyer.key() == deal.buyer, ZetoError::Unauthorized);
        require!(clock.unix_timestamp < deal.expiry_ts, ZetoError::DealExpired);

        // Fee: 0.2% of quote, paid by buyer only. Seller pays nothing.
        let buyer_fee = deal.quote_amount
            .checked_mul(deal.fee_bps as u64)
            .ok_or(ZetoError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(ZetoError::Overflow)?;

        let seller_fee: u64 = 0;
        let quote_to_seller = deal.quote_amount
            .checked_sub(buyer_fee)
            .ok_or(ZetoError::Overflow)?;

        let base_to_buyer = deal.base_amount;

        // 1. Transfer quote tokens from buyer to seller (net of fee)
        let cpi_accounts_to_seller = Transfer {
            from: ctx.accounts.buyer_quote_ata.to_account_info(),
            to: ctx.accounts.seller_quote_ata.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_to_seller),
            quote_to_seller,
        )?;

        // 2. Transfer buyer fee (quote) to fee recipient
        if buyer_fee > 0 {
            let cpi_accounts_buyer_fee = Transfer {
                from: ctx.accounts.buyer_quote_ata.to_account_info(),
                to: ctx.accounts.fee_quote_ata.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            };
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_buyer_fee),
                buyer_fee,
            )?;
        }

        // 3. Transfer base tokens from vault to buyer (net of fee)
        let deal_id = deal.deal_id;
        let bump = deal.bump;
        let seeds = &[
            b"deal".as_ref(),
            deal_id.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts_to_buyer = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.buyer_base_ata.to_account_info(),
            authority: ctx.accounts.deal.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts_to_buyer,
                signer_seeds,
            ),
            base_to_buyer,
        )?;

        // 4. Transfer seller fee (base) from vault to fee recipient
        if seller_fee > 0 {
            let cpi_accounts_seller_fee = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.fee_base_ata.to_account_info(),
                authority: ctx.accounts.deal.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts_seller_fee,
                    signer_seeds,
                ),
                seller_fee,
            )?;
        }

        // 5. Close vault and return rent to seller
        let cpi_accounts_close = anchor_spl::token::CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(),
            authority: ctx.accounts.deal.to_account_info(),
        };
        anchor_spl::token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_close,
            signer_seeds,
        ))?;

        // Update status
        let deal = &mut ctx.accounts.deal.to_account_info();
        let mut data = deal.try_borrow_mut_data()?;
        // Status is at offset 8 (discriminator) + 32 (deal_id) + 32 (seller) + 32 (buyer) + 32 (base_mint) + 32 (quote_mint) + 8 (base_amount) + 8 (quote_amount) + 8 (expiry_ts) + 2 (fee_bps) + 32 (fee_recipient) = 226
        data[226] = DealStatus::Settled as u8;

        emit!(DealSettled {
            deal_id: ctx.accounts.deal.deal_id,
            buyer: ctx.accounts.deal.buyer,
            seller: ctx.accounts.deal.seller,
            base_to_buyer,
            quote_to_seller,
            buyer_fee,
            seller_fee,
        });

        Ok(())
    }

    /// Seller cancels the deal. If funded, returns base tokens from vault.
    pub fn cancel_deal(ctx: Context<CancelDeal>) -> Result<()> {
        let deal = &ctx.accounts.deal;

        require!(
            deal.status == DealStatus::Initialized || deal.status == DealStatus::Funded,
            ZetoError::InvalidStatus
        );
        require!(ctx.accounts.seller.key() == deal.seller, ZetoError::Unauthorized);

        // If funded, return base tokens to seller
        if deal.status == DealStatus::Funded {
            let deal_id = deal.deal_id;
            let bump = deal.bump;
            let seeds = &[
                b"deal".as_ref(),
                deal_id.as_ref(),
                &[bump],
            ];
            let signer_seeds = &[&seeds[..]];

            // Transfer all base tokens back to seller
            let cpi_accounts = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.seller_base_ata.to_account_info(),
                authority: ctx.accounts.deal.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer_seeds,
                ),
                deal.base_amount,
            )?;

            // Close vault
            let cpi_accounts_close = anchor_spl::token::CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.deal.to_account_info(),
            };
            anchor_spl::token::close_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts_close,
                signer_seeds,
            ))?;
        }

        // Update status
        let deal = &mut ctx.accounts.deal.to_account_info();
        let mut data = deal.try_borrow_mut_data()?;
        data[226] = DealStatus::Cancelled as u8;

        emit!(DealCancelled {
            deal_id: ctx.accounts.deal.deal_id,
            seller: ctx.accounts.deal.seller,
        });

        Ok(())
    }

    /// Reclaim expired deal. Anyone can call after expiry to return funds.
    pub fn reclaim_expired(ctx: Context<ReclaimExpired>) -> Result<()> {
        let deal = &ctx.accounts.deal;
        let clock = Clock::get()?;

        require!(deal.status == DealStatus::Funded, ZetoError::InvalidStatus);
        require!(clock.unix_timestamp >= deal.expiry_ts, ZetoError::NotExpired);

        let deal_id = deal.deal_id;
        let bump = deal.bump;
        let seeds = &[
            b"deal".as_ref(),
            deal_id.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Transfer all base tokens back to seller
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.seller_base_ata.to_account_info(),
            authority: ctx.accounts.deal.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            ),
            deal.base_amount,
        )?;

        // Close vault
        let cpi_accounts_close = anchor_spl::token::CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(),
            authority: ctx.accounts.deal.to_account_info(),
        };
        anchor_spl::token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_close,
            signer_seeds,
        ))?;

        // Update status
        let deal = &mut ctx.accounts.deal.to_account_info();
        let mut data = deal.try_borrow_mut_data()?;
        data[226] = DealStatus::Cancelled as u8;

        emit!(DealCancelled {
            deal_id: ctx.accounts.deal.deal_id,
            seller: ctx.accounts.deal.seller,
        });

        Ok(())
    }
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
#[instruction(deal_id: [u8; 32])]
pub struct InitializeDeal<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + Deal::INIT_SPACE,
        seeds = [b"deal", deal_id.as_ref()],
        bump
    )]
    pub deal: Account<'info, Deal>,

    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: Buyer pubkey, validated by program logic
    pub buyer: UncheckedAccount<'info>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    /// CHECK: Fee recipient pubkey
    pub fee_recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositBase<'info> {
    #[account(
        mut,
        seeds = [b"deal", deal.deal_id.as_ref()],
        bump = deal.bump,
        has_one = seller,
        has_one = base_mint,
    )]
    pub deal: Account<'info, Deal>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub base_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = seller,
    )]
    pub seller_base_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = seller,
        seeds = [b"vault", deal.key().as_ref()],
        bump,
        token::mint = base_mint,
        token::authority = deal,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AcceptAndSettle<'info> {
    #[account(
        mut,
        seeds = [b"deal", deal.deal_id.as_ref()],
        bump = deal.bump,
        has_one = buyer,
        has_one = seller,
        has_one = base_mint,
        has_one = quote_mint,
        has_one = fee_recipient,
    )]
    pub deal: Box<Account<'info, Deal>>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller receives quote tokens and vault rent
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    pub base_mint: Box<Account<'info, Mint>>,
    pub quote_mint: Box<Account<'info, Mint>>,

    /// Buyer's quote token account (must exist - buyer pays from here)
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_quote_ata: Box<Account<'info, TokenAccount>>,

    /// Buyer's base token account (must be created by client before calling)
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_base_ata: Box<Account<'info, TokenAccount>>,

    /// Seller's quote token account (must be created by client before calling)
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = seller,
    )]
    pub seller_quote_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault", deal.key().as_ref()],
        bump,
        token::mint = base_mint,
        token::authority = deal,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: Fee recipient validated by has_one
    pub fee_recipient: UncheckedAccount<'info>,

    /// Fee recipient's base token account (must be created by client before calling)
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = fee_recipient,
    )]
    pub fee_base_ata: Box<Account<'info, TokenAccount>>,

    /// Fee recipient's quote token account (must be created by client before calling)
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = fee_recipient,
    )]
    pub fee_quote_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelDeal<'info> {
    #[account(
        mut,
        seeds = [b"deal", deal.deal_id.as_ref()],
        bump = deal.bump,
        has_one = seller,
        has_one = base_mint,
    )]
    pub deal: Account<'info, Deal>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub base_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = seller,
    )]
    pub seller_base_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault", deal.key().as_ref()],
        bump,
        token::mint = base_mint,
        token::authority = deal,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReclaimExpired<'info> {
    #[account(
        mut,
        seeds = [b"deal", deal.deal_id.as_ref()],
        bump = deal.bump,
        has_one = seller,
        has_one = base_mint,
    )]
    pub deal: Account<'info, Deal>,

    /// CHECK: Anyone can call this after expiry
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: Seller receives the tokens back
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    pub base_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = base_mint,
        associated_token::authority = seller,
    )]
    pub seller_base_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault", deal.key().as_ref()],
        bump,
        token::mint = base_mint,
        token::authority = deal,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// State
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Deal {
    pub deal_id: [u8; 32],      // Unique identifier
    pub seller: Pubkey,         // Seller wallet
    pub buyer: Pubkey,          // Buyer wallet
    pub base_mint: Pubkey,      // Token being sold
    pub quote_mint: Pubkey,     // Payment token (e.g., USDC)
    pub base_amount: u64,       // Amount of base token
    pub quote_amount: u64,      // Amount of quote token
    pub expiry_ts: i64,         // Expiry timestamp (unix seconds)
    pub fee_bps: u16,           // Fee in basis points
    pub fee_recipient: Pubkey,  // Who receives fees
    pub status: DealStatus,     // Current status
    pub created_at: i64,        // Creation timestamp
    pub bump: u8,               // PDA bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DealStatus {
    Initialized = 0,
    Funded = 1,
    Settled = 2,
    Cancelled = 3,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct DealInitialized {
    pub deal_id: [u8; 32],
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub base_amount: u64,
    pub quote_amount: u64,
    pub expiry_ts: i64,
}

#[event]
pub struct DealFunded {
    pub deal_id: [u8; 32],
    pub seller: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DealSettled {
    pub deal_id: [u8; 32],
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub base_to_buyer: u64,
    pub quote_to_seller: u64,
    pub buyer_fee: u64,
    pub seller_fee: u64,
}

#[event]
pub struct DealCancelled {
    pub deal_id: [u8; 32],
    pub seller: Pubkey,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum ZetoError {
    #[msg("Expiry timestamp must be in the future")]
    ExpiryInPast,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Invalid deal status for this operation")]
    InvalidStatus,
    #[msg("Unauthorized: signer is not the expected party")]
    Unauthorized,
    #[msg("Deal has expired")]
    DealExpired,
    #[msg("Deal has not expired yet")]
    NotExpired,
    #[msg("Arithmetic overflow")]
    Overflow,
}
