import { Link } from 'react-router-dom';

export function OpportunitiesPage() {
  return (
    <div>
      <h1>Opportunities</h1>
      <Link to="/opportunities/new">
        <button type="button">New opportunity</button>
      </Link>
    </div>
  );
}
