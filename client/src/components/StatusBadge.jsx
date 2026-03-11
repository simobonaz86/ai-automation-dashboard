const statusStyles = {
  Draft: 'badge-draft',
  Planned: 'badge-planned',
  Active: 'badge-active',
  Retired: 'badge-retired',
};

export default function StatusBadge({ status }) {
  return (
    <span className={statusStyles[status] || 'badge-draft'}>
      {status}
    </span>
  );
}
