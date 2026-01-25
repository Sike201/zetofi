export default function Card({ children, className = '', onClick }) {
  return (
    <div
      className={`rounded-xl bg-[#0d0d0d] p-6 transition-colors ${className} ${onClick ? 'cursor-pointer hover:bg-[#111]' : ''}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
