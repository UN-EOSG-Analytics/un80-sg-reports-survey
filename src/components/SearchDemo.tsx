"use client";
import { useState } from "react";
import { EntitySearch } from "./EntitySearch";
import { DocumentSearch } from "./DocumentSearch";

export function SearchDemo() {
  const [entityValue, setEntityValue] = useState("");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <EntitySearch value={entityValue} onChange={setEntityValue} placeholder="Search entities..." />
      <DocumentSearch placeholder="Search documents..." />
    </div>
  );
}
