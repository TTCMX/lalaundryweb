import styles from './PlaceholderImage.module.css';

export default function PlaceholderImage({
  label,
  aspectRatio = '16/10',
  borderRadius = 0,
  fontSize = 13,
  className = '',
  style = {},
}) {
  return (
    <div
      className={`${styles.placeholder} ${className}`}
      style={{ aspectRatio, borderRadius, fontSize, ...style }}
    >
      {label}
    </div>
  );
}
