interface Props {
  missing: string[];
}

export function StartupConfigScreen({ missing }: Props) {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Configuration required</h1>
        <p style={{ marginTop: 8, color: '#555' }}>
          The application cannot start because required configuration is missing.
        </p>
        <ul style={{ marginTop: 12 }}>
          {missing.map((k) => <li key={k}><code>{k}</code></li>)}
        </ul>
        <p style={{ marginTop: 12, color: '#555' }}>
          Restore the backend connection to repopulate these values, then reload.
        </p>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: 24, background: '#f7f7f9',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
const card: React.CSSProperties = {
  maxWidth: 520, width: '100%', padding: 24, background: 'white',
  borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
};
