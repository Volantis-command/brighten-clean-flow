import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ActiveJobViewProps {
  job: any;
  staff: any;
  property: any;
  onComplete: (updatedJob: any) => void;
}

// Default house-clean checklist
const DEFAULT_CHECKLIST: { room: string; tasks: string[] }[] = [
  { room: "Kitchen", tasks: ["Benchtops wiped", "Stovetop cleaned", "Sink scrubbed", "Appliances wiped"] },
  { room: "Bathrooms", tasks: ["Toilet scrubbed", "Shower/bath scrubbed", "Vanity wiped", "Mirror cleaned"] },
  { room: "Bedrooms", tasks: ["Surfaces dusted", "Bed made / linen changed", "Floors vacuumed"] },
  { room: "Living Areas", tasks: ["Surfaces dusted", "Floors vacuumed and mopped"] },
  { room: "Entry / Hallway", tasks: ["Floors swept and mopped", "Surfaces wiped"] },
  { room: "Bins", tasks: ["All bins emptied and relined"] },
];

const PHOTO_ROOMS = ["Kitchen", "Bathroom", "Bedroom", "Lounge", "Balcony", "Entry", "Other"];

interface ChecklistItem {
  id: string;
  room: string;
  task: string;
  completed: boolean;
  completionId?: string;
}

interface RestockItem {
  id: string;
  item_name: string;
  emoji: string | null;
  completed: boolean;
  completionId?: string;
}

interface UploadedPhoto {
  id: string;
  room_label: string;
  public_url: string;
}

export default function ActiveJobView({ job, staff, property, onComplete }: ActiveJobViewProps) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [restockItems, setRestockItems] = useState<RestockItem[]>([]);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [notes, setNotes] = useState(job.cleaner_notes ?? "");
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [incompleteRestockCount, setIncompleteRestockCount] = useState(0);
  const [uploadingRoom, setUploadingRoom] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedRoomRef = useRef<string>("");

  const isAirbnb = property?.client_type === "airbnb";

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    // Load existing photos
    const { data: existingPhotos } = await supabase
      .from("job_photos")
      .select("id, room_label, public_url")
      .eq("job_id", job.id);
    if (existingPhotos) setPhotos(existingPhotos as UploadedPhoto[]);

    // Load existing completions
    const { data: completions } = await supabase
      .from("job_checklist_completions")
      .select("id, sop_item_id, completed")
      .eq("job_id", job.id);
    const completionMap = new Map(
      (completions ?? []).map((c: any) => [c.sop_item_id, { id: c.id, completed: c.completed }])
    );

    if (isAirbnb) {
      // Load property SOP items
      let { data: sopItems } = await supabase
        .from("property_sop_items")
        .select("*")
        .eq("property_id", property.id)
        .eq("active", true)
        .order("room")
        .order("sort_order");

      // Fallback to default checklist if no SOP items configured
      if (!sopItems || sopItems.length === 0) {
        const toInsert = DEFAULT_CHECKLIST.flatMap((group, gi) =>
          group.tasks.map((task, ti) => ({
            property_id: property.id,
            room: group.room,
            task,
            sort_order: gi * 100 + ti,
            active: true,
          }))
        );
        const { data: inserted } = await supabase
          .from("property_sop_items")
          .insert(toInsert)
          .select();
        sopItems = inserted ?? [];
      }

      const items: ChecklistItem[] = (sopItems ?? []).map((s: any) => ({
        id: s.id,
        room: s.room,
        task: s.task,
        completed: completionMap.get(s.id)?.completed ?? false,
        completionId: completionMap.get(s.id)?.id,
      }));
      setChecklist(items);

      // Load restocking items
      const { data: restockRows } = await supabase
        .from("property_restocking_items")
        .select("*")
        .eq("property_id", property.id)
        .eq("active", true)
        .order("sort_order");

      const { data: restockCompletions } = await supabase
        .from("job_restocking_completions")
        .select("id, restocking_item_id, completed")
        .eq("job_id", job.id);
      const restockMap = new Map(
        (restockCompletions ?? []).map((c: any) => [c.restocking_item_id, { id: c.id, completed: c.completed }])
      );

      setRestockItems(
        (restockRows ?? []).map((r: any) => ({
          id: r.id,
          item_name: r.item_name,
          emoji: r.emoji,
          completed: restockMap.get(r.id)?.completed ?? false,
          completionId: restockMap.get(r.id)?.id,
        }))
      );
    } else {
      // House clean — use default checklist, create SOP items on-the-fly if needed
      let { data: sopItems } = await supabase
        .from("property_sop_items")
        .select("*")
        .eq("property_id", property.id)
        .eq("active", true)
        .order("sort_order");

      if (!sopItems || sopItems.length === 0) {
        // Create default SOP items for this property
        const toInsert = DEFAULT_CHECKLIST.flatMap((group, gi) =>
          group.tasks.map((task, ti) => ({
            property_id: property.id,
            room: group.room,
            task,
            sort_order: gi * 100 + ti,
            active: true,
          }))
        );
        const { data: inserted } = await supabase
          .from("property_sop_items")
          .insert(toInsert)
          .select();
        sopItems = inserted ?? [];
      }

      const items: ChecklistItem[] = (sopItems ?? []).map((s: any) => ({
        id: s.id,
        room: s.room,
        task: s.task,
        completed: completionMap.get(s.id)?.completed ?? false,
        completionId: completionMap.get(s.id)?.id,
      }));
      setChecklist(items);
    }

    setLoading(false);
  }

  async function toggleChecklistItem(index: number) {
    const item = checklist[index];
    const newCompleted = !item.completed;
    const updated = [...checklist];
    updated[index] = { ...item, completed: newCompleted };
    setChecklist(updated);

    if (item.completionId) {
      await supabase
        .from("job_checklist_completions")
        .update({ completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
        .eq("id", item.completionId);
    } else {
      const { data } = await supabase
        .from("job_checklist_completions")
        .insert({ job_id: job.id, sop_item_id: item.id, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
        .select("id")
        .single();
      if (data) {
        updated[index] = { ...updated[index], completionId: data.id };
        setChecklist(updated);
      }
    }
  }

  async function toggleRestockItem(index: number) {
    const item = restockItems[index];
    const newCompleted = !item.completed;
    const updated = [...restockItems];
    updated[index] = { ...item, completed: newCompleted };
    setRestockItems(updated);

    if (item.completionId) {
      await supabase
        .from("job_restocking_completions")
        .update({ completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
        .eq("id", item.completionId);
    } else {
      const { data } = await supabase
        .from("job_restocking_completions")
        .insert({ job_id: job.id, restocking_item_id: item.id, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
        .select("id")
        .single();
      if (data) {
        updated[index] = { ...updated[index], completionId: data.id };
        setRestockItems(updated);
      }
    }
  }

  function handlePhotoRoomTap(room: string) {
    selectedRoomRef.current = room;
    setUploadingRoom(room);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setUploadingRoom(null);
      return;
    }

    const room = selectedRoomRef.current;
    const timestamp = Date.now();
    const storagePath = `jobs/${job.id}/${room.toLowerCase().replace(/\s/g, "_")}_${timestamp}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from("job-photos")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadErr) {
      toast.error("Photo upload failed");
      setUploadingRoom(null);
      e.target.value = "";
      return;
    }

    const { data: urlData } = supabase.storage.from("job-photos").getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    const { data: photoRow } = await supabase
      .from("job_photos")
      .insert({ job_id: job.id, storage_path: storagePath, public_url: publicUrl, room_label: room })
      .select("id, room_label, public_url")
      .single();

    if (photoRow) {
      setPhotos((prev) => [...prev, photoRow as UploadedPhoto]);
    }

    setUploadingRoom(null);
    e.target.value = "";
    toast.success(`${room} photo uploaded`);
  }

  function handleCompleteClick() {
    const incompleteChecklist = checklist.filter((c) => !c.completed).length;
    const incompleteRestock = restockItems.filter((r) => !r.completed).length;
    const totalIncomplete = incompleteChecklist + incompleteRestock;
    if (totalIncomplete > 0) {
      setIncompleteCount(incompleteChecklist);
      setIncompleteRestockCount(incompleteRestock);
      setShowWarning(true);
    } else {
      setShowConfirm(true);
    }
  }

  function formatAuPhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-()]/g, "");
    if (cleaned.startsWith("+61")) return cleaned;
    if (cleaned.startsWith("61") && cleaned.length >= 11) return "+" + cleaned;
    if (cleaned.startsWith("0")) return "+61" + cleaned.slice(1);
    return "+61" + cleaned;
  }

  async function confirmComplete() {
    setShowConfirm(false);
    setShowWarning(false);
    setCompleting(true);

    const now = new Date();
    const checkOutIso = now.toISOString();
    const timeStr = format(now, "h:mma").toLowerCase();

    // 1. Save notes
    // 2. Update job status
    const { error: updateErr } = await supabase
      .from("jobs")
      .update({
        status: "completed",
        check_out_time: checkOutIso,
        cleaner_notes: notes || null,
      })
      .eq("id", job.id);

    if (updateErr) {
      toast.error("Failed to complete job. Please try again.");
      setCompleting(false);
      return;
    }

    // 3. Send completion SMS (fire-and-forget)
    sendCompletionSms(timeStr).catch((err) => console.error("Completion SMS failed:", err));

    // 4. Notify parent
    onComplete({ ...job, status: "completed", check_out_time: checkOutIso, cleaner_notes: notes });
    toast.success("Job marked as complete!");
  }

  async function sendCompletionSms(timeStr: string) {
    const { data: cpRows } = await supabase
      .from("client_properties")
      .select("client_id")
      .eq("property_id", property?.id)
      .limit(1);

    const clientId = cpRows?.[0]?.client_id;
    if (!clientId) return;

    const { data: clientProfile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", clientId)
      .maybeSingle();

    if (!clientProfile?.phone) return;

    const clientFirst = (clientProfile.full_name ?? "").split(" ")[0] || "there";
    const cleanerFirst = (staff?.full_name ?? "").split(" ")[0] || "Your cleaner";
    const propName = property?.property_name ?? "your property";
    const reportUrl = job.report_token
      ? `https://brightly.cleaning/report/${job.report_token}`
      : "";

    const message = isAirbnb
      ? `Hi ${clientFirst}, ${propName} is clean and guest-ready ✓ Finished ${timeStr}. Full report with photos: ${reportUrl}`
      : `Hi ${clientFirst}, your Brightly clean is complete! ✓ ${cleanerFirst} finished at ${timeStr}. View your clean report: ${reportUrl}`;

    await supabase.functions.invoke("send-job-sms", {
      body: { to: formatAuPhone(clientProfile.phone), message },
    });
  }

  // --- Group checklist by room ---
  const roomGroups = checklist.reduce<Record<string, { index: number; item: ChecklistItem }[]>>(
    (acc, item, index) => {
      if (!acc[item.room]) acc[item.room] = [];
      acc[item.room].push({ index, item });
      return acc;
    },
    {}
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Checklist */}
      <div>
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3">
          {isAirbnb ? "Property Checklist" : "Cleaning Checklist"}
        </h3>
        {Object.entries(roomGroups).map(([room, tasks]) => (
          <Card key={room} className="mb-3 border-border">
            <CardContent className="p-4">
              <h4 className="font-bold text-foreground text-sm mb-2">{room}</h4>
              <div className="space-y-2.5">
                {tasks.map(({ index, item }) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 min-h-[44px] cursor-pointer"
                    onClick={() => toggleChecklistItem(index)}
                  >
                    <Checkbox checked={item.completed} className="h-5 w-5" />
                    <span
                      className={`text-sm ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
                    >
                      {item.task}
                    </span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Restocking (Airbnb only) */}
      {isAirbnb && restockItems.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
              Restocking Checklist
            </h3>
            <span className="text-xs font-bold text-muted-foreground">
              {restockItems.filter(r => r.completed).length} of {restockItems.length} restocked
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {restockItems.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => toggleRestockItem(idx)}
                className={`relative rounded-xl border-2 p-3 text-center transition-all min-h-[88px] flex flex-col items-center justify-center gap-1 ${
                  item.completed
                    ? "bg-primary/10 border-primary"
                    : "bg-card border-border"
                }`}
              >
                <span className="text-[32px] leading-none">{item.emoji || "📦"}</span>
                <span className={`text-[11px] font-semibold leading-tight ${item.completed ? "text-primary" : "text-foreground"}`}>
                  {item.item_name}
                </span>
                {item.completed && (
                  <div className="absolute top-1.5 right-1.5">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      <div>
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3">
          Photos (optional)
        </h3>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {PHOTO_ROOMS.map((room) => (
            <Button
              key={room}
              variant="outline"
              size="sm"
              className="h-12 text-xs font-medium"
              onClick={() => handlePhotoRoomTap(room)}
              disabled={uploadingRoom === room}
            >
              {uploadingRoom === room ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Camera className="h-3.5 w-3.5 mr-1" />
                  {room}
                </>
              )}
            </Button>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelected}
        />
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative rounded-lg overflow-hidden aspect-square bg-muted">
                <img src={p.public_url} alt={p.room_label} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                  {p.room_label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cleaner Notes */}
      <div>
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2">
          Notes for client/host (optional)
        </h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Found a broken tile in bathroom, left note on bench"
          className="min-h-[100px] text-sm"
        />
      </div>

      {/* Sticky Complete Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border safe-area-bottom">
        <Button
          size="lg"
          className="w-full h-14 text-lg font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground max-w-lg mx-auto block"
          onClick={handleCompleteClick}
          disabled={completing}
        >
          {completing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
          COMPLETE JOB
        </Button>
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this clean as complete?</AlertDialogTitle>
            <AlertDialogDescription>
              This will notify the client and close out the job.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmComplete}>Complete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Incomplete Warning Dialog */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{incompleteCount} items not ticked</AlertDialogTitle>
            <AlertDialogDescription>
              You have {incompleteCount} checklist item{incompleteCount > 1 ? "s" : ""} still incomplete.
              Complete anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={confirmComplete}>Complete Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
