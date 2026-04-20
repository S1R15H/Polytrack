interface DirectionsButtonProps {
  onClick: () => void;
  className?: string; // Opt-in layout override
}

export function DirectionsButton({ onClick, className = '' }: DirectionsButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all font-semibold text-sm whitespace-nowrap active:scale-95 ${className}`}
    >
      Directions
    </button>
  );
}
