// One semantic palette for both static-structure and influence-line figures.
export const learningChartPalette = {
  paper: '#f1f6fb',
  ink: '#425a76',
  muted: '#5d7089',
  grid: '#dce6f0',
  axis: '#92a8bf',
  support: '#b6c9dc',
  load: '#9d5c26',
  moment: '#7956b8',
  shear: '#147d72',
  axial: '#326eae',
  tension: '#326eae',
  compression: '#b04d6e',
  section: '#956126',
} as const;

export const learningChartStyle = Object.fromEntries(
  Object.entries(learningChartPalette).map(([role, color]) => [`--chart-${role}`, color]),
);
