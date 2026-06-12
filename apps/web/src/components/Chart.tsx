/** Compact SVG charts (bar + line) for the progress insights. */

export type Point = { label: string; value: number };

const W = 320;
const H = 150;
const PAD = 22;

export function BarChart({
	points,
	color = "#0a7b4f",
}: {
	points: Point[];
	color?: string;
}) {
	if (points.length === 0) return null;
	const max = Math.max(1, ...points.map((p) => p.value));
	const innerW = W - PAD * 2;
	const innerH = H - PAD * 2;
	const bw = innerW / points.length;
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label="bar chart"
		>
			<line
				x1={PAD}
				y1={H - PAD}
				x2={W - PAD}
				y2={H - PAD}
				stroke="#E0E8E0"
				strokeWidth={1}
			/>
			{points.map((p, i) => {
				const h = (p.value / max) * innerH;
				const x = PAD + i * bw + bw * 0.2;
				const y = H - PAD - h;
				return (
					<g key={i}>
						<rect x={x} y={y} width={bw * 0.6} height={h} rx={3} fill={color} />
						{p.value > 0 ? (
							<text
								x={x + bw * 0.3}
								y={y - 3}
								fontSize={9}
								fill="#5A6E5A"
								textAnchor="middle"
							>
								{p.value}
							</text>
						) : null}
					</g>
				);
			})}
		</svg>
	);
}

export function LineChart({
	points,
	color = "#0a7b4f",
}: {
	points: Point[];
	color?: string;
}) {
	if (points.length === 0) return null;
	const max = Math.max(1, ...points.map((p) => p.value));
	const innerW = W - PAD * 2;
	const innerH = H - PAD * 2;
	const step = points.length > 1 ? innerW / (points.length - 1) : 0;
	const coords = points.map((p, i) => ({
		x: PAD + i * step,
		y: H - PAD - (p.value / max) * innerH,
	}));
	const d = coords
		.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
		.join(" ");
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label="line chart"
		>
			<line
				x1={PAD}
				y1={H - PAD}
				x2={W - PAD}
				y2={H - PAD}
				stroke="#E0E8E0"
				strokeWidth={1}
			/>
			<path
				d={d}
				fill="none"
				stroke={color}
				strokeWidth={3}
				strokeLinejoin="round"
			/>
			{coords.map((c, i) => (
				<circle key={i} cx={c.x} cy={c.y} r={3.5} fill={color} />
			))}
		</svg>
	);
}
