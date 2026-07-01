import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Filters {
  query: string;
  role: string;
  location: string;
  workMode: string;
  experience: string;
  minSalary: number;
}

export const emptyFilters: Filters = {
  query: "", role: "any", location: "any", workMode: "any", experience: "any", minSalary: 0,
};

export function JobFilters({
  filters,
  setFilters,
  roleOptions,
  locationOptions,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  roleOptions: string[];
  locationOptions: string[];
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search title, company, or skill…"
          className="pl-9"
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Select value={filters.role} onValueChange={(v) => setFilters({ ...filters, role: v })}>
          <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any role</SelectItem>
            {roleOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.location} onValueChange={(v) => setFilters({ ...filters, location: v })}>
          <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any location</SelectItem>
            {locationOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.workMode} onValueChange={(v) => setFilters({ ...filters, workMode: v })}>
          <SelectTrigger><SelectValue placeholder="Work mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any mode</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="onsite">Onsite</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.experience} onValueChange={(v) => setFilters({ ...filters, experience: v })}>
          <SelectTrigger><SelectValue placeholder="Experience" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any level</SelectItem>
            <SelectItem value="intern">Intern</SelectItem>
            <SelectItem value="entry">Entry</SelectItem>
            <SelectItem value="mid">Mid</SelectItem>
            <SelectItem value="senior">Senior</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="executive">Executive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Minimum salary</span>
          <span className="font-medium text-foreground">${filters.minSalary.toLocaleString()}+</span>
        </div>
        <Slider
          value={[filters.minSalary]}
          onValueChange={([v]) => setFilters({ ...filters, minSalary: v })}
          max={400000}
          step={10000}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
          <X className="mr-1 h-3.5 w-3.5" /> Clear filters
        </Button>
      </div>
    </div>
  );
}
