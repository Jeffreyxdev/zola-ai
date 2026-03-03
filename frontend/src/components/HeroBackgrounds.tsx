import React from 'react';
import GhostCursor from './GhostCursor';

// Simple animated gradient component
const Grainient: React.FC<{
  style?: React.CSSProperties;
  [key: string]: any;
}> = ({ style, ...props }) => (
  <div
    style={{
      ...style,
      background: 'linear-gradient(135deg, #373739 0%, #3c3b3f 50%, #4a4950 100%)',
      animation: 'grainientFlow 8s ease-in-out infinite',
    }}
  />
);

/**
 * Full‑screen absolute container for decorative backgrounds.
 * All children are placed behind page content and will not
 * intercept pointer events.
 */
const BgContainer: React.FC<{ className?: string; style?: React.CSSProperties; children?: React.ReactNode }> = ({
  className = '',
  style,
  children
}) => (
  <div
    className={`absolute inset-0 pointer-events-none overflow-hidden z-0 ${className}`}
    style={style}
  >
    {children}
  </div>
);

export const GrainientBackground: React.FC = () => (
  <BgContainer>
    {/* effect is sized to fill the parent container */}
    <Grainient
      style={{ width: '100%', height: '100%' }}
      color1="#373739"
      color2="#3c3b3f"
      color3="#4a4950"
      timeSpeed={0.4}
      colorBalance={0.01}
      warpStrength={1.3}
      warpFrequency={5}
      warpSpeed={2}
      warpAmplitude={50}
      blendAngle={23}
      blendSoftness={0.14}
      rotationAmount={640}
      noiseScale={1.85}
      grainAmount={0}
      grainScale={0.2}
      grainAnimated={false}
      contrast={1.5}
      gamma={1}
      saturation={1}
      centerX={0}
      centerY={0}
      zoom={0.9}
    />
  </BgContainer>
);

export const GhostCursorBackground: React.FC = () => (
  <BgContainer>
    <GhostCursor
      style={{ width: '100%', height: '100%' }}
      trailLength={35}
      inertia={0}
      grainIntensity={0.05}
      bloomStrength={0.2}
      bloomRadius={1}
      brightness={2.3}
      color="#3f2a84"
      edgeIntensity={0.1}
    />
  </BgContainer>
);

export default BgContainer;
