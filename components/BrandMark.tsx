import Image from "next/image";

// The real SOCIA mark (blue S + sparkle on a dark tile). The source art sits
// on a square black field, so the tile look comes from CSS corner rounding.
export default function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <Image
      src="/brand/socia-mark.png"
      alt="SOCIA"
      width={size}
      height={size}
      className="brandmark"
      priority
    />
  );
}
