import { useEffect, useMemo, useState } from "react";
import { RadialWarpBackground } from "../components/RadialWarpBackground";
import { TextParticleHero } from "../components/TextParticleHero";
import { HOME_HERO_SCENE } from "../config/homeHeroScene";
import LegacyAppPage from "./LegacyAppPage";
import "../styles/home.css";
import "../styles/home-parallax.css";

function HomeParallaxPage() {
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(1);

  useEffect(() => {
    let ticking = false;

    const sync = () => {
      setScrollY(window.scrollY);
      ticking = false;
    };

    const handleScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(sync);
    };

    const handleResize = () => {
      setViewportHeight(Math.max(window.innerHeight || 1, 1));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    handleResize();
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const progress = useMemo(() => {
    return Math.min(scrollY / viewportHeight, 1);
  }, [scrollY, viewportHeight]);

  const layerShift = progress * 130;
  const contentShift = progress * 80;

  return (
    <div className="home-parallax-page">
      <section className="home-landing" aria-label="首页">
        <div className="radial-scene-shell home-landing-shell">
          <RadialWarpBackground config={HOME_HERO_SCENE.background} />
          <div className="radial-scene-content">
            <main
              className="home-page home-page-parallax"
              style={{ transform: `translateY(${contentShift}px)` }}
            >
              <h1 className="sr-only">{HOME_HERO_SCENE.content.text}</h1>

              <div
                className="home-parallax-layer"
                style={{ transform: `translateY(${layerShift}px)` }}
              >
                <TextParticleHero
                  text={HOME_HERO_SCENE.content.text}
                  config={HOME_HERO_SCENE.particles}
                />
              </div>
              <div className="home-scroll-indicator" aria-hidden="true" />
            </main>

            <div
              className="home-parallax-fade"
              style={{ opacity: Math.min(0.85, progress * 1.1) }}
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      <section id="feature-panel" className="home-feature-panel" aria-label="功能界面">
        <LegacyAppPage embedded />
      </section>
    </div>
  );
}

export default HomeParallaxPage;
