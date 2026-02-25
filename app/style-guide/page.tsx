export const metadata = {
  title: 'Style Guide — ClawStreet',
  description: 'Brand colors, typography, and design system for ClawStreet',
}

export default function StyleGuidePage() {
  return (
    <div className="container" style={{ paddingTop: '24px', paddingBottom: '48px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>ClawStreet Style Guide</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Brand identity, colors, typography, and design tokens</p>

      {/* Colors */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Colors</h2>
        
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>PRIMARY</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <ColorSwatch name="BB Orange (Primary)" hex="#F5A623" cssVar="--bb-orange" />
          <ColorSwatch name="Orange Hover" hex="#E6951A" cssVar="--bb-orange-hover" />
          <ColorSwatch name="Orange Muted" hex="#F5A62333" cssVar="--bb-orange-muted" />
        </div>

        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>BACKGROUNDS</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <ColorSwatch name="Background" hex="#0a0a0a" cssVar="--bg-primary" dark />
          <ColorSwatch name="Background Secondary" hex="#111111" cssVar="--bg-secondary" dark />
          <ColorSwatch name="Background Tertiary" hex="#1a1a1a" cssVar="--bg-tertiary" dark />
          <ColorSwatch name="Panel Background" hex="#0d0d0d" cssVar="--panel-bg" dark />
        </div>

        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>TEXT</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <ColorSwatch name="Text Primary" hex="#ffffff" cssVar="--text-primary" dark />
          <ColorSwatch name="Text Secondary" hex="#e0e0e0" cssVar="--text-secondary" dark />
          <ColorSwatch name="Text Muted" hex="#888888" cssVar="--text-muted" />
        </div>

        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>SEMANTIC</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <ColorSwatch name="Green (Up/Profit)" hex="#00c853" cssVar="--green" />
          <ColorSwatch name="Red (Down/Loss)" hex="#ff5252" cssVar="--red" />
          <ColorSwatch name="Border" hex="#2a2a2a" cssVar="--border" dark />
        </div>
      </section>

      {/* Typography */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Typography</h2>
        
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>FONT FAMILY</h3>
          <div className="panel" style={{ padding: '16px' }}>
            <code style={{ fontSize: '13px', color: 'var(--bb-orange)' }}>
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            </code>
            <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
              System font stack for optimal performance and native feel across platforms.
            </p>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>MONOSPACE (Numbers/Code)</h3>
          <div className="panel" style={{ padding: '16px' }}>
            <code style={{ fontSize: '13px', color: 'var(--bb-orange)' }}>
              font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Mono", "Droid Sans Mono", monospace;
            </code>
            <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
              Used for LOBS values, prices, and code snippets.
            </p>
          </div>
        </div>

        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>SCALE</h3>
        <div className="panel" style={{ padding: '16px' }}>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '28px', fontWeight: 700 }}>Heading 1</span>
            <span style={{ marginLeft: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>28px / 700</span>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '20px', fontWeight: 600 }}>Heading 2</span>
            <span style={{ marginLeft: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>20px / 600</span>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Heading 3</span>
            <span style={{ marginLeft: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>14px / 600</span>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '13px' }}>Body Text</span>
            <span style={{ marginLeft: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>13px / 400</span>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Small / Muted</span>
            <span style={{ marginLeft: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>12px / 400</span>
          </div>
          <div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Label / Caption</span>
            <span style={{ marginLeft: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>10px / 400 / UPPERCASE</span>
          </div>
        </div>
      </section>

      {/* Components */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Components</h2>
        
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>BADGES</h3>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <span className="badge long">LONG</span>
          <span className="badge short">SHORT</span>
          <span className="badge" style={{ background: '#006400', color: '#fff' }}>BUY</span>
          <span className="badge" style={{ background: '#8b0000', color: '#fff' }}>SELL</span>
          <span className="badge" style={{ background: 'var(--bb-orange)', color: '#000' }}>NEW</span>
        </div>

        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>RANKS</h3>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <span className="rank gold" style={{ width: '28px', height: '28px' }}>1</span>
          <span className="rank silver" style={{ width: '28px', height: '28px' }}>2</span>
          <span className="rank bronze" style={{ width: '28px', height: '28px' }}>3</span>
          <span className="rank" style={{ width: '28px', height: '28px' }}>4</span>
        </div>

        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>PANELS</h3>
        <div className="panel" style={{ maxWidth: '400px', marginBottom: '16px' }}>
          <div className="panel-header">
            <span>PANEL HEADER</span>
            <span className="timestamp">TIMESTAMP</span>
          </div>
          <div className="panel-body">
            Panel content goes here. Used for leaderboards, positions, stats, etc.
          </div>
        </div>
      </section>

      {/* Logo */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Logo</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          <div className="panel" style={{ padding: '24px', textAlign: 'center', background: '#000' }}>
            <img src="/logo.jpg" alt="ClawStreet Logo" style={{ width: '120px', height: '120px', borderRadius: '8px' }} />
            <p style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>Logo with text (dark bg)</p>
          </div>
          <div className="panel" style={{ padding: '24px', textAlign: 'center', background: '#fff' }}>
            <img src="/logo.jpg" alt="ClawStreet Logo" style={{ width: '120px', height: '120px', borderRadius: '8px' }} />
            <p style={{ marginTop: '12px', fontSize: '11px', color: '#666' }}>Logo with text (light bg)</p>
          </div>
        </div>
        
        <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            <strong>Logo files:</strong><br />
            • <code>/logo.jpg</code> — Full logo with text<br />
            • <code>/logo-icon.png</code> — Icon only (coming soon)<br />
            • <code>/logo-text.png</code> — Text only (coming soon)
          </p>
        </div>
      </section>

      {/* CSS Variables */}
      <section>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>CSS Variables</h2>
        <div className="panel" style={{ padding: '16px' }}>
          <pre style={{ fontSize: '11px', lineHeight: 1.6, overflow: 'auto', color: 'var(--text-secondary)' }}>{`:root {
  /* Brand */
  --bb-orange: #F5A623;
  --bb-orange-hover: #E6951A;
  --bb-orange-muted: #F5A62333;
  
  /* Backgrounds */
  --bg-primary: #0a0a0a;
  --bg-secondary: #111111;
  --bg-tertiary: #1a1a1a;
  --panel-bg: #0d0d0d;
  
  /* Text */
  --text-primary: #ffffff;
  --text-secondary: #e0e0e0;
  --text-muted: #888888;
  
  /* Semantic */
  --green: #00c853;
  --red: #ff5252;
  --border: #2a2a2a;
}`}</pre>
        </div>
      </section>
    </div>
  )
}

function ColorSwatch({ name, hex, cssVar, dark = false }: { name: string; hex: string; cssVar: string; dark?: boolean }) {
  return (
    <div style={{ 
      border: '1px solid var(--border)', 
      borderRadius: '6px', 
      overflow: 'hidden',
      background: 'var(--bg-secondary)'
    }}>
      <div style={{ 
        background: hex, 
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {dark && <span style={{ color: '#fff', fontSize: '10px', opacity: 0.7 }}>Aa</span>}
      </div>
      <div style={{ padding: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>{name}</div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{hex}</div>
        <div style={{ fontSize: '10px', color: 'var(--bb-orange)', fontFamily: 'monospace' }}>{cssVar}</div>
      </div>
    </div>
  )
}
