"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveOpenRouterKey } from "@/app/settings/actions";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!key.startsWith("sk-or-v1-")) {
      setError("Invalid API Key format. Must start with 'sk-or-v1-'");
      return;
    }
    setLoading(true);
    const result = await saveOpenRouterKey(key);
    setLoading(false);

    if (result.success) {
      onOpenChange(false);
      setKey("");
    } else {
      console.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API Configuration</DialogTitle>
          <DialogDescription>
            Enter your OpenRouter API Key to use the application.
            Your key is encrypted securely.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">OpenRouter API Key</label>
            <Input
              type="password"
              placeholder="sk-or-v1-..."
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                if (error) setError("");
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button onClick={handleSave} disabled={loading || !key}>
            {loading ? "Saving..." : "Save Key"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}