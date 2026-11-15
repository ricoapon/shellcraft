import { useEffect, useRef, useState } from 'react';
import type { ViewNode } from '../runtime/player-runtime';

interface Props {
  node: ViewNode;
  onInteract(handler: string, value: unknown): void;
  depth?: number;
}
type Row = Record<string, unknown>;
const label = (value: unknown): string =>
  typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value);
const records = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.slice(0, 500).filter((item) => item && typeof item === 'object')
    : [];

function DataTable({ node, onInteract }: Props) {
  const [sort, setSort] = useState<{ key: string; descending: boolean }>();
  const rows = records(node.data);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12);
  if (sort)
    rows.sort((a, b) => {
      const left = a[sort.key],
        right = b[sort.key];
      const comparison =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : label(left).localeCompare(label(right));
      return sort.descending ? -comparison : comparison;
    });
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>
                <button
                  onClick={() =>
                    setSort({
                      key: column,
                      descending: sort?.key === column ? !sort.descending : false,
                    })
                  }
                >
                  {column}
                  {sort?.key === column ? (sort.descending ? ' ↓' : ' ↑') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const id = row.id ?? row.path;
            const select = () => {
              if (node.onSelect && id !== undefined) onInteract(node.onSelect, id);
            };
            return (
              <tr
                key={label(id ?? index)}
                onClick={select}
                tabIndex={node.onSelect && id !== undefined ? 0 : undefined}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') select();
                }}
              >
                {columns.map((column) => (
                  <td key={column}>{label(row[column])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">No collected data yet.</p>}
    </div>
  );
}

function NetworkGraph({ node, onInteract }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const event = useRef(onInteract);
  event.current = onInteract;
  const selection = useRef(node.onSelect);
  selection.current = node.onSelect;
  const graphData = JSON.stringify({
    nodes: node.nodes ?? (node.data as Row | undefined)?.nodes,
    edges: node.edges ?? (node.data as Row | undefined)?.edges,
  });
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    import('cytoscape')
      .then(({ default: cytoscape }) => {
        if (disposed || !container.current) return;
        const nodes = records(node.nodes ?? (node.data as Row | undefined)?.nodes);
        const ids = new Set(nodes.map((entry) => String(entry.id)));
        const edges = records(node.edges ?? (node.data as Row | undefined)?.edges).filter(
          (edge) => ids.has(String(edge.source)) && ids.has(String(edge.target)),
        );
        const graph = cytoscape({
          container: container.current,
          layout: { name: 'circle' },
          elements: [
            ...nodes.map((entry) => ({
              data: {
                id: String(entry.id),
                label: label(entry.label ?? entry.id),
                color: label(entry.color ?? '#8fdbab'),
              },
            })),
            ...edges.map((entry, i) => ({
              data: {
                id: `edge-${entry.id ?? i}`,
                source: String(entry.source),
                target: String(entry.target),
                color: label(entry.color ?? '#526c5e'),
                width: Number.isFinite(Number(entry.width))
                  ? Math.max(0.5, Math.min(10, Number(entry.width)))
                  : 1.5,
              },
            })),
          ],
          style: [
            {
              selector: 'node',
              style: {
                label: 'data(label)',
                'background-color': 'data(color)',
                color: '#d7e3dc',
                'font-size': 11,
                'text-margin-y': 8,
                'text-valign': 'bottom',
              },
            },
            {
              selector: 'edge',
              style: {
                width: 'data(width)',
                'line-color': 'data(color)',
                'target-arrow-shape': 'triangle',
                'target-arrow-color': 'data(color)',
                'curve-style': 'bezier',
              },
            },
          ],
        });
        graph.on('tap', 'node', (selected) => {
          if (selection.current) event.current(selection.current, selected.target.id());
        });
        const observer = new ResizeObserver(() => {
          graph.resize();
          graph.fit(undefined, 32);
        });
        observer.observe(container.current);
        cleanup = () => {
          observer.disconnect();
          graph.destroy();
        };
      })
      .catch((failure) => setError(String(failure)));
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [graphData]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div ref={container} className="network-graph" aria-label="Interactive network graph" />
    </>
  );
}

function MermaidDiagram({ source }: { source: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    Promise.all([import('mermaid'), import('dompurify')])
      .then(async ([{ default: mermaid }, { default: sanitize }]) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
          suppressErrorRendering: true,
          htmlLabels: false,
        });
        const { svg } = await mermaid.render(
          `diagram-${crypto.randomUUID()}`,
          source.slice(0, 15_000),
        );
        if (!disposed && container.current) {
          container.current.innerHTML = sanitize.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
          });
          setError('');
        }
      })
      .catch((failure) => {
        if (!disposed) setError(String(failure));
      });
    return () => {
      disposed = true;
    };
  }, [source]);
  return (
    <>
      {error ? (
        <pre className="error-message">{error}</pre>
      ) : (
        <div className="mermaid-diagram" ref={container} />
      )}
    </>
  );
}

export default function ScreenRenderer({ node, onInteract, depth = 0 }: Props) {
  if (depth > 8) return <p className="error-message">Screen nesting limit exceeded.</p>;
  const title = node.title ? <h3>{label(node.title)}</h3> : null;
  if (node.type === 'stack')
    return (
      <div className="screen-stack">
        {(node.children ?? []).slice(0, 50).map((child, i) => (
          <ScreenRenderer key={i} node={child} onInteract={onInteract} depth={depth + 1} />
        ))}
      </div>
    );
  let content;
  switch (node.type) {
    case 'text':
      content = <pre>{label(node.text ?? node.data)}</pre>;
      break;
    case 'table':
      content = <DataTable node={node} onInteract={onInteract} />;
      break;
    case 'button':
      content = (
        <button
          onClick={() => {
            if (node.onClick) onInteract(node.onClick, node.id ?? null);
          }}
        >
          {label(node.text ?? node.label ?? 'Action')}
        </button>
      );
      break;
    case 'mermaid':
      content = <MermaidDiagram source={label(node.text ?? node.source)} />;
      break;
    case 'networkGraph':
      content = <NetworkGraph node={node} onInteract={onInteract} />;
      break;
    case 'barChart': {
      const rows = records(node.data);
      const max = Math.max(
        1,
        ...rows.map((row) => (Number.isFinite(Number(row.value)) ? Number(row.value) : 0)),
      );
      content = (
        <div className="bar-chart">
          {rows.map((row, i) => (
            <button
              key={label(row.id ?? row.label ?? i)}
              disabled={!node.onSelect}
              onClick={() => {
                if (node.onSelect) onInteract(node.onSelect, row.id ?? row.label);
              }}
            >
              <span>{label(row.label ?? row.id)}</span>
              <span className="bar-track">
                <span
                  style={{
                    width: `${Math.max(0, Math.min(100, (Number(row.value) / max) * 100))}%`,
                    background: typeof row.color === 'string' ? row.color : undefined,
                  }}
                />
              </span>
              <span>{Number(row.value).toFixed(1)}</span>
            </button>
          ))}
        </div>
      );
      break;
    }
    case 'lineChart': {
      const data = records(node.data).filter(
        (row) => Number.isFinite(Number(row.x)) && Number.isFinite(Number(row.y)),
      );
      const minX = Math.min(0, ...data.map((row) => Number(row.x))),
        maxX = Math.max(1, ...data.map((row) => Number(row.x)));
      const minY = Math.min(0, ...data.map((row) => Number(row.y))),
        maxY = Math.max(1, ...data.map((row) => Number(row.y)));
      content = (
        <svg
          className="line-chart"
          viewBox="0 0 520 180"
          role="img"
          aria-label={node.title ?? 'Line chart'}
        >
          <path d="M35 10 V150 H510" fill="none" stroke="#526c5e" />
          <polyline
            fill="none"
            stroke="#8fdbab"
            strokeWidth="2"
            points={data
              .map(
                (row) =>
                  `${35 + ((Number(row.x) - minX) / (maxX - minX)) * 465},${150 - ((Number(row.y) - minY) / (maxY - minY)) * 130}`,
              )
              .join(' ')}
          />
          <text x="35" y="174">
            {minX}
          </text>
          <text x="480" y="174">
            {maxX}
          </text>
          <text x="2" y="20">
            {maxY.toFixed(0)}
          </text>
        </svg>
      );
      break;
    }
    default:
      content = <p className="error-message">Unknown view type: {label(node.type)}</p>;
  }
  return (
    <section className="screen-card">
      {title}
      {content}
    </section>
  );
}
