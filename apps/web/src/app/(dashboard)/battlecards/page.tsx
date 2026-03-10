"use client";

import { useState, useEffect } from "react";
import { Swords, Plus, Search } from "lucide-react";

interface Battlecard {
  id: string;
  competitorName: string;
  lastUpdated: string;
  dealMentions: number;
  strengths: string[];
  weaknesses: string[];
}

export default function BattlecardsPage() {
  const [battlecards, setBattlecards] = useState<Battlecard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: fetch from /api/v1/battlecards once backend is wired
    setLoading(false);
  }, []);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Competitive Battlecards</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated competitive intelligence from deal signals
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Add Competitor
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : battlecards.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Swords className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No battlecards yet</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Battlecards are auto-generated when competitors are mentioned in
            deal emails, notes, or call transcripts. You can also add
            competitors manually.
          </p>
          <button className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Add Competitor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {battlecards.map((card) => (
            <div
              key={card.id}
              className="rounded-lg border p-5 hover:bg-accent/50 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Swords className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-medium">{card.competitorName}</h3>
                </div>
                <span className="text-xs text-muted-foreground">
                  {card.dealMentions} deal mentions
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {card.strengths.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-green-600 dark:text-green-400">
                      Their strengths
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {card.strengths.slice(0, 2).join(", ")}
                    </div>
                  </div>
                )}
                {card.weaknesses.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-red-600 dark:text-red-400">
                      Their weaknesses
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {card.weaknesses.slice(0, 2).join(", ")}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Updated {card.lastUpdated}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
