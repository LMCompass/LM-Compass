"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveOpenRouterKey } from "@/app/settings/actions";
import { KeyRound, Lock, AlertCircle } from "lucide-react";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const openRouterKeyRegex = /^sk-or-v1-[A-Za-z0-9]{64}$/;
    if (!openRouterKeyRegex.test(key)) {
      setError("Invalid API Key format. Must match 'sk-or-v1-' followed by 64 alphanumeric characters.");
      return;
    }
    setLoading(true);
    setError("");
    const result = await saveOpenRouterKey(key);
    setLoading(false);

    if (result.success) {
      onOpenChange(false);
      setKey("");
      setError("");
    } else {
      setError(result.error || "Failed to save API key");
    }
  };

  const handleClose = (open: boolean) => {
    if (!open && !loading) {
      setKey("");
      setError("");
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">API Configuration</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Add your OpenRouter API key to use this application
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label htmlFor="api-key" className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              OpenRouter API Key
            </label>
            <Input
              id="api-key"
              type="password"
              placeholder="sk-or-v1-..."
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                if (error) setError("");
              }}
              className="font-mono text-sm"
              disabled={loading}
            />
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Your API key is encrypted and stored securely. You can get your key from{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                OpenRouter
              </a>
              .
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !key} className="min-w-[100px]">
            {loading ? "Saving..." : "Save Key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}