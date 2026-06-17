import type { CSSProperties } from "react";

type LayeredTextLine = {
  top: string;
  bottom: string;
};

type LayeredTextProps = {
  lines: LayeredTextLine[];
  className?: string;
  fontSize?: string;
  fontSizeMd?: string;
  lineHeight?: number;
  lineHeightMd?: number;
  baseOffset?: number;
  baseOffsetMd?: number;
};

type LayeredStyle = CSSProperties & Record<`--${string}`, string>;

export function LayeredText({
  lines,
  className = "",
  fontSize = "58px",
  fontSizeMd = "36px",
  lineHeight = 50,
  lineHeightMd = 32,
  baseOffset = 32,
  baseOffsetMd = 20,
}: LayeredTextProps) {
  const centerIndex = Math.floor(lines.length / 2);
  const rootStyle: LayeredStyle = {
    "--lt-font": fontSize,
    "--lt-font-md": fontSizeMd,
    "--lt-lh": `${lineHeight}px`,
    "--lt-lh-md": `${lineHeightMd}px`,
    "--lt-shift": `-${lineHeight}px`,
    "--lt-shift-md": `-${lineHeightMd}px`,
  };

  return (
    <div className={`layered-text ${className}`} style={rootStyle}>
      <ul className="layered-text__list">
        {lines.map((line, index) => {
          const even = index % 2 === 0;
          const skew = even
            ? "skew(60deg, -30deg) scaleY(0.66667)"
            : "skew(0deg, -30deg) scaleY(1.33333)";
          const lineStyle: LayeredStyle = {
            "--lt-skew": skew,
            "--lt-tx": `${(index - centerIndex) * baseOffset}px`,
            "--lt-tx-md": `${(index - centerIndex) * baseOffsetMd}px`,
          };
          const colStyle: LayeredStyle = {
            "--lt-delay": `${index * 0.08}s`,
          };

          return (
            <li className="layered-text__line" key={`${line.top}-${line.bottom}`} style={lineStyle}>
              <div className="layered-text__col" style={colStyle}>
                <p className="layered-text__word">{line.top}</p>
                <p className="layered-text__word">{line.bottom}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
