import { TextParticleHero } from "../components/TextParticleHero";
import { withRadialWarpBackground } from "../components/withRadialWarpBackground";
import { HOME_HERO_SCENE } from "../config/homeHeroScene";
import "../styles/home.css";

function HomePage() {
  return (
    <main className="home-page">
      <h1 className="sr-only">{HOME_HERO_SCENE.content.text}</h1>
      <TextParticleHero
        text={HOME_HERO_SCENE.content.text}
        config={HOME_HERO_SCENE.particles}
      />

      <section className="hero-top">
        <div className="hero-copy">
          <p className="hero-eyebrow">{HOME_HERO_SCENE.content.eyebrow}</p>
          <p className="hero-description">
            {HOME_HERO_SCENE.content.description}
          </p>
          <a className="hero-link" href="/legacy">
            进入旧版 App 页面
          </a>
        </div>

        <div className="hero-badge" aria-label="motion label">
          <span className="hero-badge-dot" />
          {HOME_HERO_SCENE.content.badge}
        </div>
      </section>

      <section className="hero-params" aria-label="scene parameters">
        {HOME_HERO_SCENE.stats.map((item) => (
          <article className="hero-param-card" key={item.label}>
            <p className="hero-param-label">{item.label}</p>
            <strong className="hero-param-value">{item.value}</strong>
            <p className="hero-param-note">{item.note}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

const HomePageWithBackground = withRadialWarpBackground(HomePage, {
  background: HOME_HERO_SCENE.background,
});

export default HomePageWithBackground;
