import { ICONS, type IconName } from './icons';

export type { IconName };

interface IconProps { name: IconName; size?: number; className?: string; title?: string }

/** One of Jehre's icons (Iconly, Curved). It takes the colour of the text around it. */
export function Icon({ name, size = 20, className, title }: IconProps) {
  const icon = ICONS[name];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={icon.viewBox}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}

/** The Jehre mark: the founder's hand-drawn cloud. In ink, or in the logo's full rainbow (`rainbow`). */
export function Logo({ height = 36, className, rainbow }: { height?: number; className?: string; rainbow?: boolean }) {
  const icon = ICONS.cloud;
  const grad = '<defs><linearGradient id="jehre-rainbow" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0" stop-color="#E8467C"/><stop offset=".17" stop-color="#F08A3C"/><stop offset=".34" stop-color="#F0C414"/><stop offset=".5" stop-color="#22C97E"/><stop offset=".67" stop-color="#1E9BE0"/><stop offset=".84" stop-color="#6A4CFF"/><stop offset="1" stop-color="#C13CE0"/></linearGradient></defs>';
  return (
    <svg
      className={className}
      height={height}
      width={Math.round((height * 600) / 446)}
      viewBox={icon.viewBox}
      role="img"
      aria-label="Jehre"
      focusable="false"
      fill={rainbow ? 'url(#jehre-rainbow)' : 'currentColor'}
      dangerouslySetInnerHTML={{ __html: (rainbow ? grad : '') + icon.body }}
    />
  );
}
