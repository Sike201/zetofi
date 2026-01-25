export default function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  required = false,
  disabled = false,
  className = '',
  ...props
}) {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1 block text-sm font-medium text-white/70">
          {label}
          {required && <span className="ml-1 text-white/50">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-white/60">{error}</p>}
    </div>
  );
}
