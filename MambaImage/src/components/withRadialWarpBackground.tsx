import type { ComponentType } from "react";
import type { RadialBackgroundConfig } from "../config/homeHeroScene";
import { RadialWarpBackground } from "./RadialWarpBackground";

type WithBackgroundOptions = {
  background: RadialBackgroundConfig;
};

export function withRadialWarpBackground<P extends object>(
  WrappedComponent: ComponentType<P>,
  options: WithBackgroundOptions,
) {
  function WithRadialWarpBackground(props: P) {
    return (
      <div className="radial-scene-shell">
        <RadialWarpBackground config={options.background} />
        <div className="radial-scene-content">
          <WrappedComponent {...props} />
        </div>
      </div>
    );
  }

  const wrappedName =
    WrappedComponent.displayName || WrappedComponent.name || "Component";
  WithRadialWarpBackground.displayName = `withRadialWarpBackground(${wrappedName})`;

  return WithRadialWarpBackground;
}
