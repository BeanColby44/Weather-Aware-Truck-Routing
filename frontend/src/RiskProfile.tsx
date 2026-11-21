import { RISK_COLOR } from "./format";
import type { Segment } from "./types";

export default function RiskProfile({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.miles, 0);
  if (total <= 0) return null;
  return (
    <span className="profile" title="Risk along this route">
      {segments.map((segment, index) => (
        <i
          key={`${segment.from_mile}-${index}`}
          style={{
            width: `${(segment.miles / total) * 100}%`,
            background: RISK_COLOR[segment.level],
          }}
        />
      ))}
    </span>
  );
}
