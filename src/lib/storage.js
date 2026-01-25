// localStorage keys
const INTENTS_KEY = 'zeto_intents';
const DEALS_KEY = 'zeto_deals';

/**
 * Get all intent posts from localStorage
 * Ensures each intent has an id (adds one for legacy intents).
 * @returns {Array} - Array of intent posts
 */
export function getIntents() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(INTENTS_KEY);
    let intents = stored ? JSON.parse(stored) : [];
    let changed = false;
    intents = intents.map((i, idx) => {
      if (i.id) return i;
      changed = true;
      return { ...i, id: `intent_${i.createdAt || Date.now()}_${idx}_${Math.random().toString(36).slice(2, 9)}` };
    });
    if (changed) localStorage.setItem(INTENTS_KEY, JSON.stringify(intents));
    return intents;
  } catch {
    return [];
  }
}

/**
 * Save an intent post to localStorage
 * @param {Object} intent - Intent post object
 */
export function saveIntent(intent) {
  if (typeof window === 'undefined') return;
  try {
    const intents = getIntents();
    const id = intent.id || `intent_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    intents.push({ ...intent, id });
    localStorage.setItem(INTENTS_KEY, JSON.stringify(intents));
  } catch (error) {
    console.error('Failed to save intent:', error);
  }
}

/**
 * Delete an intent by id
 * @param {string} id - Intent id
 */
export function deleteIntent(id) {
  if (typeof window === 'undefined') return;
  try {
    const intents = getIntents().filter((i) => i.id !== id);
    localStorage.setItem(INTENTS_KEY, JSON.stringify(intents));
  } catch (error) {
    console.error('Failed to delete intent:', error);
  }
}

/**
 * Get all deals from localStorage
 * @returns {Object} - Object mapping deal IDs to deal objects
 */
export function getDeals() {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(DEALS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Get a single deal by ID
 * @param {string} dealId - The deal ID
 * @returns {Object|null} - Deal object or null if not found
 */
export function getDeal(dealId) {
  const deals = getDeals();
  return deals[dealId] || null;
}

/**
 * Save a deal to localStorage
 * @param {string} dealId - The deal ID
 * @param {Object} deal - Deal object
 */
export function saveDeal(dealId, deal) {
  if (typeof window === 'undefined') return;
  try {
    const deals = getDeals();
    deals[dealId] = deal;
    localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
  } catch (error) {
    console.error('Failed to save deal:', error);
  }
}

/**
 * Update a deal's status
 * @param {string} dealId - The deal ID
 * @param {string} status - New status ('SETTLED' or 'CANCELLED')
 */
export function updateDealStatus(dealId, status) {
  if (typeof window === 'undefined') return;
  try {
    const deals = getDeals();
    if (deals[dealId]) {
      deals[dealId].status = status;
      localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
    }
  } catch (error) {
    console.error('Failed to update deal status:', error);
  }
}
