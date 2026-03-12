"use client";

import { useState, useEffect, useCallback } from "react";
import { Swords, Plus, ChevronDown, ChevronUp } from "lucide-react";

interface Battlecard {
  id: string;
  competitorName: string;
  lastUpdated: string;
  status: string;
  dealMentions: number;
  strengths: string[];
  weaknesses: string[];
  ourAdvantages: string[];
  competitorOverview: string;
  objectionHandling: Array<{ their_claim: string; our_response: string }>;
  discoveryQuestions: string[];
}

export default function BattlecardsPage() {
  const [battlecards, setBattlecards] = useState<Battlecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchBattlecards = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/battlecards");
      if (res.ok) {
        const json = await res.json();
        setBattlecards(json.data ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch battlecards:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBattlecards();
  }, [fetchBattlecards]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border/50 p-4 space-y-2">
              <div className="h-5 w-36 rounded bg-primary/10 animate-pulse" />
              <div className="h-3 w-full rounded bg-primary/10 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-primary/10 animate-pulse" />
            </div>
          ))}
        </div>
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
              onClick={() => setExpandedId(expandedId === card.id ? null : card.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Swords className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-medium">{card.competitorName}</h3>
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 ${
                      card.status === "approved"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}
                  >
                    {card.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {card.dealMentions} deal mentions
                  </span>
                  {expandedId === card.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Summary always visible */}
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

              {/* Expanded detail */}
              {expandedId === card.id && (
                <div className="mt-4 space-y-3 border-t pt-4">
                  {card.competitorOverview && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Overview</div>
                      <p className="text-sm">{card.competitorOverview}</p>
                    </div>
                  )}

                  {card.strengths.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                        All Strengths
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {card.strengths.map((s, i) => (
                          <li key={i}>- {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {card.weaknesses.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                        All Weaknesses
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {card.weaknesses.map((w, i) => (
                          <li key={i}>- {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {card.ourAdvantages.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                        Our Advantages
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {card.ourAdvantages.map((a, i) => (
                          <li key={i}>- {a}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {card.objectionHandling.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Objection Handling
                      </div>
                      <div className="space-y-2">
                        {card.objectionHandling.map((obj, i) => (
                          <div key={i} className="text-sm rounded bg-accent/50 p-2">
                            <div className="font-medium text-red-600 dark:text-red-400">
                              &quot;{obj.their_claim}&quot;
                            </div>
                            <div className="text-muted-foreground mt-1">
                              {obj.our_response}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {card.discoveryQuestions.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Discovery Questions
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {card.discoveryQuestions.map((q, i) => (
                          <li key={i}>{i + 1}. {q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 text-xs text-muted-foreground">
                Updated {new Date(card.lastUpdated).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
