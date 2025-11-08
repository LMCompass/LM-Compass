"use client"

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Save, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

type CreateRubricFormProps = {
  defaultDescription: string;
};

export default function CreateRubricForm({ defaultDescription }: CreateRubricFormProps) {
  const router = useRouter();
  const { open } = useSidebar();
  const [rubricName, setRubricName] = useState("");
  const [rubricDescription, setRubricDescription] = useState(defaultDescription);
  const [errors, setErrors] = useState<{ rubricName?: string }>({});

const handleSave = () => {
  const trimmed = rubricName.trim();
  if (!trimmed) {
    setErrors({ rubricName: "Please enter a rubric name" });
    return;
  }
  setErrors({}); // clear errors

    const rubricData = {
      name: trimmed,
      description: rubricDescription,
      createdAt: new Date().toISOString()
    };

    console.log("Saving rubric:", rubricData);
    // TODO: Save to backend/database
    
    router.push("/?success=rubric-created");
  };

  return (
    <SidebarInset>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between p-4 sm:p-6 border-b">
          <div className="flex items-center gap-4">
            {!open && <SidebarTrigger />}
            <Button 
              variant="ghost" 
              onClick={() => router.push("/")}
              className="gap-2"
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Create Rubric
          </h1>
          <div className="w-24"></div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Form Section */}
            <section className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="rubric-name" className="text-sm font-medium">
                  Rubric Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="rubric-name"
                  placeholder="e.g., Essay Evaluation Rubric"
                  value={rubricName}
                  onChange={(e) => setRubricName(e.target.value)}
                  className="w-full"
                  aria-invalid={!!errors.rubricName}
                  aria-describedby={errors.rubricName ? "rubric-name-error" : undefined}
                />
                {errors.rubricName && (
                  <p id="rubric-name-error" className="text-destructive text-sm mt-1">
                    {errors.rubricName}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="rubric-description" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="rubric-description"
                  placeholder="Describe the purpose and usage of this rubric..."
                  value={rubricDescription}
                  onChange={(e) => setRubricDescription(e.target.value)}
                  className="w-full min-h-32"
                />
              </div>
            </section>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-end pb-8">
              <Button 
                variant="outline" 
                onClick={() => router.push("/")}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                className="gap-2"
                disabled={!rubricName.trim()}
              >
                <Save className="size-4" />
                Save Rubric
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

