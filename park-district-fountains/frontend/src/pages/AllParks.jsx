import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import ParkCard from "../components/ParkCard";
import { useData } from "../DataContext";

export default function AllParks() {
  const { parks } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    setSearchParams(q ? { q } : {}, { replace: true });
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? parks.filter(
        (p) =>
          p.park_name.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q)
      )
    : [...parks].sort((a, b) => a.park_name.localeCompare(b.park_name));

  return (
    <div>
      <input
        id="search-input"
        type="search"
        placeholder="Search parks…"
        value={query}
        onChange={handleInput}
        autoCapitalize="none"
      />
      <p id="search-summary">
        {q
          ? `${filtered.length} park${filtered.length !== 1 ? "s" : ""} matching "${query}"`
          : `${filtered.length} parks`}
      </p>
      {filtered.map((park) => (
        <ParkCard key={park.park_id} park={park} dist={null} />
      ))}
    </div>
  );
}
