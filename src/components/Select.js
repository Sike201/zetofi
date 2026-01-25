export default function Select({
  label,
  value,
  onChange,
  options,
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
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-[#1a1a1a] [&>option]:text-white ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-white/60">{error}</p>}
    </div>
  );
}
