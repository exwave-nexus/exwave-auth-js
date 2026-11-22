/** The initials of a name in a circle, such as "TP" for Test Player. */
export function Avatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase())
    .join("");
  return (
    <span className={large ? "avatar avatar-lg" : "avatar"} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
