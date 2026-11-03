import './loader.css';

interface SkeletonRowsProps {
  count?: number;
  height?: number;
}

export function SkeletonRows({ count = 3, height = 44 }: SkeletonRowsProps) {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row" style={{ height }} />
      ))}
    </div>
  );
}
