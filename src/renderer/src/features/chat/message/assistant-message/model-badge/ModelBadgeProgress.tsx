import React from 'react';
import './ModelBadgeProgress.css';

// CSS drives the orbit; React only updates geometry when the badge resizes.
export function ModelBadgeProgress({
  active,
}: {
  active: boolean;
}): React.JSX.Element | null {
  const [progressVisible, setProgressVisible] = React.useState(active);

  React.useEffect(() => {
    if (active) {
      setProgressVisible(true);
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) {
      setProgressVisible(false);
      return;
    }
    const timeout = window.setTimeout(() => setProgressVisible(false), 180);
    const onMotionChange = (): void => {
      if (reducedMotion.matches) setProgressVisible(false);
    };
    reducedMotion.addEventListener('change', onMotionChange);
    return (): void => {
      window.clearTimeout(timeout);
      reducedMotion.removeEventListener('change', onMotionChange);
    };
  }, [active]);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = React.useState({
    width: 0,
    height: 0,
    radius: 0,
  });

  React.useLayoutEffect(() => {
    const surface = svgRef.current?.parentElement;
    if (!surface) return;

    const measure = (): void => {
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      const radius = Math.max(
        0,
        Math.min(
          parseFloat(getComputedStyle(surface).borderTopLeftRadius) - 1 || 0,
          (width - 2) / 2,
          (height - 2) / 2,
        ),
      );
      setGeometry((previous) =>
        previous.width === width &&
        previous.height === height &&
        previous.radius === radius
          ? previous
          : { width, height, radius },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    surface.addEventListener('transitionend', measure);
    return (): void => {
      observer.disconnect();
      surface.removeEventListener('transitionend', measure);
    };
  }, [active, progressVisible]);

  const { width, height, radius } = geometry;
  const perimeter = 2 * (width + height - 4) + (2 * Math.PI - 8) * radius;
  const segmentLength = Math.min(120, perimeter * 0.45) / 48;
  if (!active && !progressVisible) return null;
  return (
    <svg
      ref={svgRef}
      className="model-badge-progress"
      data-active={active}
      aria-hidden="true"
      style={
        {
          '--badge-orbit-length': `${perimeter}px`,
          '--badge-orbit-duration': `${perimeter / 270}s`,
        } as React.CSSProperties
      }
    >
      {width > 2 &&
        height > 2 &&
        Array.from({ length: 48 }, (_, index) => (
          <rect
            key={index}
            className="model-badge-comet-segment"
            x="1"
            y="1"
            width={width - 2}
            height={height - 2}
            rx={radius}
            fill="none"
            strokeDasharray={`${segmentLength + 0.4} ${perimeter - segmentLength - 0.4}`}
            style={
              {
                '--badge-orbit-offset': `${index * segmentLength}px`,
                opacity: Math.pow(1 - index / 48, 1.7) * 0.95,
              } as React.CSSProperties
            }
          />
        ))}
    </svg>
  );
}
