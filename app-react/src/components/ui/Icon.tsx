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

/** The Jehre mark: the founder's hand-drawn cloud, in ink. */
export function Logo({ height = 36, className }: { height?: number; className?: string }) {
  const icon = ICONS.cloud;
  return (
    <svg
      className={className}
      height={height}
      width={Math.round((height * 600) / 446)}
      viewBox={icon.viewBox}
      role="img"
      aria-label="Jehre"
      focusable="false"
      fill="currentColor"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
