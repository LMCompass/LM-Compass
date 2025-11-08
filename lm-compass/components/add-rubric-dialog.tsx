"use client"

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface AddRubricDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (rubric: { name: string; description: string }) => void;
}

export function AddRubricDialog({ open, onOpenChange, onSave }: AddRubricDialogProps) {
  const [rubricName, setRubricName] = useState("");
  const [rubricDescription, setRubricDescription] = useState("");

  const handleSave = () => {
    // Validation: both fields must be filled
    if (!rubricName.trim() || !rubricDescription.trim()) {
      return;
    }

    const rubric = { name: rubricName, description: rubricDescription };
    
    // Call the onSave callback if provided
    if (onSave) {
      onSave(rubric);
    } else {
      // Default behavior: log to console
      console.log("Saving rubric:", rubric);
    }
    
    // Clear form and close dialog
    setRubricName("");
    setRubricDescription("");
    onOpenChange(false);
  };

  const isFormValid = rubricName.trim() !== "" && rubricDescription.trim() !== "";

  const handleCancel = () => {
    // Clear form and close dialog
    setRubricName("");
    setRubricDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Rubric</DialogTitle>
          <DialogDescription>
            Create a new evaluation rubric
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="rubric-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="rubric-name"
              placeholder="Enter rubric name"
              value={rubricName}
              onChange={(e) => setRubricName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="rubric-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="rubric-description"
              placeholder="Enter rubric description"
              value={rubricDescription}
              onChange={(e) => setRubricDescription(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isFormValid}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

