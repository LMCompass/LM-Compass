"use client";

import { useState } from "react";
import {
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/sidebar/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { AddRubricDialog } from "@/components/add-rubric-dialog";
import { createRubric } from "../actions";

export default function ViewRubricsPage() {
  const { open } = useSidebar();
  const [showAddRubricDialog, setShowAddRubricDialog] = useState(false);

  const handleSaveRubric = async (rubric: {
    name: string;
    description: string;
  }) => {
    const result = await createRubric(rubric);

    if (result.success) {
      console.log("Rubric saved successfully:", result.data);
      setShowAddRubricDialog(false);
      // TODO: Refresh the rubrics list or show success message
    } else {
      console.error("Error saving rubric:", result.error);
      // TODO: Show error message to user
    }
  };

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col">
        <header className="flex-shrink-0 flex items-center gap-4 p-4 sm:p-6">
          {!open && <SidebarTrigger />}
          <Link href="/chat">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4 mr-2" />
              Back to Chat
            </Button>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex-1">
            View Rubrics
          </h1>
          <Button
            variant="outline"
            onClick={() => setShowAddRubricDialog(true)}
          >
            <Plus className="size-4 mr-2" />
            Add Rubric
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <h2 className="text-xl font-semibold mb-2">Rubrics View</h2>
            <p>This page will display your rubrics.</p>
          </div>
        </div>

        <AddRubricDialog
          open={showAddRubricDialog}
          onOpenChange={setShowAddRubricDialog}
          onSave={handleSaveRubric}
        />
      </div>
    </SidebarInset>
  );
}
