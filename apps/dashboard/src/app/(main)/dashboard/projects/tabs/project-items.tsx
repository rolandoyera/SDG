"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import Link from "next/link";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import type {
  ColumnSizingState,
  OnChangeFn,
  VisibilityState,
} from "@tanstack/react-table";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import {
  DollarSign,
  Edit,
  Eye,
  FolderPlus,
  Home,
  LayoutGrid,
  Loader2,
  Columns3,
  MoreVertical,
  Pencil,
  PlusCircle,
  RotateCcw,
  Rows3,
  ShoppingBag,
  Trash2,
  Grid,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { useAuth } from "@/components/auth-context";
import { DashboardImage } from "@/components/dashboard-image";
import { FadeIn } from "@/components/fade-in";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addProjectRoom,
  deleteProjectRoom,
  deleteProjectRoomItem,
  getLibraryItems,
  getVendors,
  reorderProjectRoomItems,
  updateProjectItemsLayout,
  updateProjectRoom,
} from "@/lib/db";
import { db } from "@/lib/firebase";
import type {
  LibraryItem,
  Project,
  ProjectRoom,
  ProjectRoomItem,
  Vendor,
} from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

import { AddItemsDialog } from "./_tab_components/add-items-dialog";
import { EditItemDialog } from "./_tab_components/edit-item-dialog";
import {
  itemColumnLayoutKey,
  normalizeItemColumnLayout,
} from "./_tab_components/items-fields";
import { ITEM_COLUMN_OPTIONS, ItemsTable } from "./_tab_components/items-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ----------------------------------------------------
// Validation Schemas
// ----------------------------------------------------
const roomSchema = z.object({
  name: z.string().min(1, "Room name is required."),
  description: z.string().optional(),
});

type RoomFormData = z.infer<typeof roomSchema>;

// How long to wait after the last column toggle/resize before persisting the
// shared layout — coalesces the rapid changes a resize-drag produces.
const LAYOUT_SAVE_DEBOUNCE_MS = 600;

// ----------------------------------------------------
// List View — one table per section (mirrors the proposal layout)
// ----------------------------------------------------

interface RoomListCardProps {
  room: ProjectRoom;
  items: ProjectRoomItem[];
  vendors: Vendor[];
  visibleColumns: VisibilityState;
  columnSizing: ColumnSizingState;
  onColumnSizingChange: OnChangeFn<ColumnSizingState>;
  onEdit: (room: ProjectRoom) => void;
  onAddItem: (room: ProjectRoom) => void;
  onDelete: (room: ProjectRoom) => void;
  onEditItem: (item: ProjectRoomItem) => void;
  onDeleteItem: (item: ProjectRoomItem) => void;
}

function RoomListCard({
  room,
  items,
  vendors,
  visibleColumns,
  columnSizing,
  onColumnSizingChange,
  onEdit,
  onAddItem,
  onDelete,
  onEditItem,
  onDeleteItem,
}: RoomListCardProps) {
  const subtotal = items.reduce(
    (acc, item) => acc + item.sellingPrice * item.quantity,
    0,
  );

  // Droppable target so items can be dragged into this section (including when
  // it's empty, where there are no sortable rows to drop onto).
  const { setNodeRef, isOver } = useDroppable({ id: `room:${room.roomId}` });

  return (
    <Card variant="panel">
      <CardHeader>
        <div>
          <CardTitle>
            <LayoutGrid className="icons" />
            {room.name}
          </CardTitle>
          {room.description && (
            <CardDescription className="mt-0.5 ml-6.5 line-clamp-2 font-light text-xs">
              {room.description}
            </CardDescription>
          )}
        </div>
        <TooltipDropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="size-4" />
              <span className="sr-only">Section actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onAddItem(room)}>
              <PlusCircle className="size-4" />
              Add Item
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(room)}>
              <Edit className="size-4" />
              Edit Section
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(room)}
            >
              <Trash2 className="size-4" />
              Delete Section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </TooltipDropdownMenu>
      </CardHeader>

      <CardContent
        ref={setNodeRef}
        className={cn("p-0", isOver && "bg-primary/5 ring-1 ring-primary/30")}
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center text-muted-foreground">
            <ShoppingBag className="mb-2 size-8 text-muted-foreground/30" />
            <p className="font-medium text-xs">
              {isOver
                ? "Drop to add to this section."
                : "No items in section yet."}
            </p>
          </div>
        ) : (
          <ItemsTable
            items={items}
            vendors={vendors}
            columnVisibility={visibleColumns}
            columnSizing={columnSizing}
            onColumnSizingChange={onColumnSizingChange}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
          />
        )}
      </CardContent>

      <CardFooter className="flex shrink-0 items-center justify-end gap-12 h-16">
        <div className="flex flex-col items-center gap-1 text-xl">
          <Label>Items</Label>
          {items.length}
        </div>
        <div className="flex flex-col items-center gap-1 text-xl">
          <Label>Section Total</Label>
          {formatCurrency(subtotal, { noDecimals: true })}
        </div>
      </CardFooter>
    </Card>
  );
}

// ----------------------------------------------------
// Component Props
// ----------------------------------------------------
interface ProjectItemsProps {
  project: Project;
}

export function ProjectItems({ project: initialProject }: ProjectItemsProps) {
  const { profile, organizationId, loading: authLoading } = useAuth();
  // Live project doc — kept in sync so shared edits (incl. the column layout)
  // appear for everyone viewing in real time, not just on next load.
  const [project, setProject] = useState<Project>(initialProject);
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [roomItems, setRoomItems] = useState<ProjectRoomItem[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"grid" | "list">("grid");
  // Seed the grid layout from the project's shared layout (falling back to
  // defaults) so every viewer sees the same presentation. The project listener
  // below reconciles it live; the editing user's own changes flow through
  // optimistic local state.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => normalizeItemColumnLayout(initialProject.itemColumnLayout).visibility,
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    () => normalizeItemColumnLayout(initialProject.itemColumnLayout).sizing,
  );
  // Canonical key of the layout we believe is persisted. Used to (a) dedupe
  // writes and (b) break the snapshot→setState→save feedback loop: a
  // remote-applied layout matches this ref, so the save effect skips it. It must
  // be `itemColumnLayoutKey` (order-insensitive) on BOTH sides — Firestore
  // returns map keys sorted, so a raw JSON compare never matches what we wrote.
  const persistedLayoutRef = useRef(
    itemColumnLayoutKey(initialProject.itemColumnLayout),
  );

  // Dialog States
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false);
  // When set, the room dialog edits this room; otherwise it creates a new one.
  const [editingRoom, setEditingRoom] = useState<ProjectRoom | null>(null);
  const [activeRoomForAddItems, setActiveRoomForAddItems] =
    useState<ProjectRoom | null>(null);
  const [editingItem, setEditingItem] = useState<ProjectRoomItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<ProjectRoomItem | null>(
    null,
  );
  const [deletingRoom, setDeletingRoom] = useState<ProjectRoom | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form setups
  const roomForm = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
    defaultValues: { name: "", description: "" },
  });

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const id = organizationId; // stable string dependency; profile object identity churns on each heartbeat

    let unsubscribed = false;

    // Load global catalog data once
    async function initData() {
      try {
        const [libItemsData, vendorsData] = await Promise.all([
          getLibraryItems(id),
          getVendors(id),
        ]);
        if (unsubscribed) return;
        setLibraryItems(libItemsData);
        setVendors(vendorsData);
      } catch (error) {
        console.error("Error loading initial catalog data:", error);
      }
    }
    void initData();

    // Live project doc: keep shared fields current and reconcile the column
    // layout when another viewer changes it. We only re-apply the layout when it
    // differs from what we last persisted, so our own echoes (and the resulting
    // setState) don't loop back into another save.
    const unsubscribeProject = onSnapshot(
      doc(db, "projects", project.projectId),
      (snap) => {
        if (unsubscribed || !snap.exists()) return;
        const data = snap.data() as Project;
        setProject(data);
        const incoming = itemColumnLayoutKey(data.itemColumnLayout);
        if (incoming !== persistedLayoutRef.current) {
          persistedLayoutRef.current = incoming;
          const next = normalizeItemColumnLayout(data.itemColumnLayout);
          setColumnVisibility(next.visibility);
          setColumnSizing(next.sizing);
        }
      },
      (error) => {
        console.error("Project snapshot error:", error);
      },
    );

    // Set up snapshot listener for rooms
    const roomsQuery = query(
      collection(db, "projectRooms"),
      where("projectId", "==", project.projectId),
    );
    const unsubscribeRooms = onSnapshot(
      roomsQuery,
      (snapshot) => {
        if (unsubscribed) return;
        const roomsData: ProjectRoom[] = [];
        snapshot.forEach((docSnap) => {
          roomsData.push(docSnap.data() as ProjectRoom);
        });

        setRooms(roomsData.sort((a, b) => a.createdAt - b.createdAt));
        setLoading(false);
      },
      (error) => {
        console.error("Rooms snapshot error:", error);
        setLoading(false);
      },
    );

    // Set up snapshot listener for room items
    const itemsQuery = query(
      collection(db, "projectRoomItems"),
      where("projectId", "==", project.projectId),
    );
    const unsubscribeItems = onSnapshot(
      itemsQuery,
      (snapshot) => {
        if (unsubscribed) return;
        const itemsData: ProjectRoomItem[] = [];
        snapshot.forEach((docSnap) => {
          itemsData.push(docSnap.data() as ProjectRoomItem);
        });
        setRoomItems(
          itemsData.sort(
            (a, b) =>
              (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt),
          ),
        );
      },
      (error) => {
        console.error("Items snapshot error:", error);
      },
    );

    return () => {
      unsubscribed = true;
      unsubscribeProject();
      unsubscribeRooms();
      unsubscribeItems();
    };
  }, [project.projectId, organizationId, authLoading]);

  // Persist the shared column layout to the project whenever the user toggles or
  // resizes a column, debounced so a resize-drag coalesces into one write. The
  // first invocation is skipped so simply opening the page (initial state) never
  // writes the layout back. Layouts matching what's already persisted are no-ops,
  // which also stops a remote change (applied via the listener) from echoing into
  // another write. Other viewers see the change live through the listener.
  const skipFirstPersistRef = useRef(true);
  useEffect(() => {
    if (skipFirstPersistRef.current) {
      skipFirstPersistRef.current = false;
      return;
    }
    const layout = normalizeItemColumnLayout({
      visibility: columnVisibility as Record<string, boolean>,
      sizing: columnSizing,
    });
    const key = itemColumnLayoutKey(layout);
    if (key === persistedLayoutRef.current) return;
    const timer = setTimeout(() => {
      persistedLayoutRef.current = key;
      void updateProjectItemsLayout(project.projectId, layout).catch(
        (error) => {
          console.error(error);
          toast.error("Failed to save the column layout.");
        },
      );
    }, LAYOUT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [columnVisibility, columnSizing, project.projectId]);

  // Open the dialog in create mode (blank form).
  const openCreateRoom = () => {
    setEditingRoom(null);
    roomForm.reset({ name: "", description: "" });
    setIsRoomDialogOpen(true);
  };

  // Open the dialog in edit mode, prefilled with the room's current values.
  const openEditRoom = (room: ProjectRoom) => {
    setEditingRoom(room);
    roomForm.reset({ name: room.name, description: room.description ?? "" });
    setIsRoomDialogOpen(true);
  };

  // Handle Room submission — creates a new room or updates the one being edited.
  const onSubmitRoom = async (data: RoomFormData) => {
    if (!profile) return;
    startTransition(async () => {
      try {
        if (editingRoom) {
          await updateProjectRoom(editingRoom.roomId, {
            name: data.name,
            description: data.description,
          });
          toast.success(`"${data.name}" updated!`);
        } else {
          const newRoom = await addProjectRoom({
            projectId: project.projectId,
            name: data.name,
            description: data.description,
          });
          toast.success(`"${newRoom.name}" created!`);
        }
        roomForm.reset();
        setIsRoomDialogOpen(false);
        setEditingRoom(null);
      } catch (error) {
        console.error(error);
        toast.error(
          editingRoom
            ? "Failed to update section."
            : "Failed to create section.",
        );
      }
    });
  };

  const handleItemAdded = () => {
    // Handled in snapshot listener
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Persist a section's new order, optimistically updating local state so rows
  // don't flash back before the snapshot catches up. When `movedItemId` is set,
  // that item was dragged in from another section and is re-homed to `roomId`.
  const persistSection = (
    orderedIds: string[],
    roomId: string,
    movedItemId?: string,
  ) => {
    const orderById = new Map(orderedIds.map((id, index) => [id, index]));
    setRoomItems((prev) =>
      [...prev]
        .map((item) => {
          if (!orderById.has(item.roomItemId)) return item;
          return {
            ...item,
            sortOrder: orderById.get(item.roomItemId),
            roomId: item.roomItemId === movedItemId ? roomId : item.roomId,
          };
        })
        .sort(
          (a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt),
        ),
    );
    void reorderProjectRoomItems(
      orderedIds.map((roomItemId, index) => ({
        roomItemId,
        sortOrder: index,
        roomId: roomItemId === movedItemId ? roomId : undefined,
      })),
    ).catch((error) => {
      console.error(error);
      toast.error("Failed to save the new order.");
    });
  };

  // The dragged item's section when the drag began. Lets drag-end tell whether
  // the item changed sections (so we persist its new `roomId`) without an extra
  // render. Set on drag start, cleared on drag end.
  const dragOriginRoomRef = useRef<string | null>(null);

  // Resolve the section a drop target belongs to: a row carries its item's
  // `roomId`; a section drop zone uses the `room:<roomId>` id directly.
  const resolveRoomId = (
    overId: string,
    items: ProjectRoomItem[],
  ): string | undefined =>
    overId.startsWith("room:")
      ? overId.slice(5)
      : items.find((i) => i.roomItemId === overId)?.roomId;

  const handleDragStart = (event: DragStartEvent) => {
    const activeItem = roomItems.find((i) => i.roomItemId === event.active.id);
    dragOriginRoomRef.current = activeItem?.roomId ?? null;
  };

  // Live cross-section preview: as soon as the pointer crosses into another
  // section, re-home the dragged item in local state so its row actually moves
  // and both lists animate. Same-section moves are left to the sortable strategy
  // (handled visually by transforms, committed on drag end).
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    setRoomItems((prev) => {
      const activeItem = prev.find((i) => i.roomItemId === activeId);
      if (!activeItem) return prev;
      const toRoomId = resolveRoomId(overId, prev);
      if (!toRoomId || activeItem.roomId === toRoomId) return prev;

      // Pull the item out, re-home it, and splice it next to the row it's over
      // (or onto the end of the section when hovering its empty space).
      const next = prev.filter((i) => i.roomItemId !== activeId);
      const moved = { ...activeItem, roomId: toRoomId };
      let insertAt: number;
      if (overId.startsWith("room:")) {
        const lastIdx = next.reduce(
          (acc, item, idx) => (item.roomId === toRoomId ? idx : acc),
          -1,
        );
        insertAt = lastIdx + 1;
      } else {
        const idx = next.findIndex((i) => i.roomItemId === overId);
        insertAt = idx === -1 ? next.length : idx;
      }
      next.splice(insertAt, 0, moved);
      return next;
    });
  };

  // Commit the final order. By now `onDragOver` has already placed the item in
  // its destination section, so this just settles the in-section position and
  // persists, re-homing the item if it ended up in a different section.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const originRoom = dragOriginRoomRef.current;
    dragOriginRoomRef.current = null;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    const activeItem = roomItems.find((i) => i.roomItemId === activeId);
    if (!activeItem) return;
    const roomId = activeItem.roomId;

    let sectionIds = roomItems
      .filter((i) => i.roomId === roomId)
      .map((i) => i.roomItemId);
    if (!overId.startsWith("room:") && activeId !== overId) {
      const oldIndex = sectionIds.indexOf(activeId);
      const newIndex = sectionIds.indexOf(overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        sectionIds = arrayMove(sectionIds, oldIndex, newIndex);
      }
    }

    const movedItemId = originRoom !== roomId ? activeId : undefined;
    // Nothing changed: same section, same position, no drop target shift.
    if (!movedItemId && overId === activeId) return;
    persistSection(sectionIds, roomId, movedItemId);
  };

  // Delete the confirmed item; the snapshot listener removes it from state.
  const handleConfirmDeleteItem = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      await deleteProjectRoomItem(deletingItem.roomItemId);
      toast.success(`"${deletingItem.name}" removed.`);
      setDeletingItem(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete item.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Number of items left in the section pending deletion — drives whether the
  // dialog deletes outright or blocks until the items are moved/removed.
  const deletingRoomItemCount = deletingRoom
    ? roomItems.filter((item) => item.roomId === deletingRoom.roomId).length
    : 0;

  // Delete an empty section. Guarded so a section with items can never be
  // removed (the dialog only exposes the action when the section is empty).
  const handleConfirmDeleteRoom = async () => {
    if (!deletingRoom || deletingRoomItemCount > 0) return;
    setIsDeleting(true);
    try {
      await deleteProjectRoom(deletingRoom.roomId);
      toast.success(`"${deletingRoom.name}" deleted.`);
      setDeletingRoom(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete section.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculations for total quantities and values
  const totalItemCount = roomItems.length;
  const totalSelectedValue = roomItems.reduce(
    (acc, item) => acc + item.sellingPrice * item.quantity,
    0,
  );
  const totalCostValue = roomItems.reduce(
    (acc, item) => acc + (item.unitCost ?? 0) * item.quantity,
    0,
  );
  const budgetRemaining = (project.budget ?? 0) - totalSelectedValue;

  if (loading || authLoading) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          Retrieving Items Setup
        </p>
      </div>
    );
  }

  return (
    <FadeIn className="flex w-full flex-col gap-6">
      {/* Banner / Stat Bar */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-6">
        <Card>
          <CardHeader className="py-0">
            <CardDescription className="text-xs uppercase tracking-wider">
              Total Sections
            </CardDescription>
            <CardTitle className="mt-1 flex items-center gap-2 text-foreground text-xl">
              <Home className="icons" />
              {rooms.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-0">
            <CardDescription className="text-xs uppercase tracking-wider">
              Total Items
            </CardDescription>
            <CardTitle className="mt-1 flex items-center gap-2 text-foreground text-xl">
              <ShoppingBag className="icons" />
              {totalItemCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-0">
            <CardDescription className="text-xs uppercase tracking-wider">
              Budget
            </CardDescription>
            <CardTitle className="mt-1 flex items-center gap-2 text-foreground text-xl">
              <DollarSign className="icons" />
              {project.budget
                ? formatCurrency(project.budget, {
                    noDecimals: true,
                    noSymbol: true,
                  })
                : "0"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-0">
            <CardDescription className="text-xs uppercase tracking-wider">
              Budget Remaining
            </CardDescription>
            <CardTitle className="mt-1 flex items-center gap-2 text-foreground text-xl">
              <DollarSign className="icons" />
              {formatCurrency(budgetRemaining, {
                noDecimals: true,
                noSymbol: true,
              })}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-0">
            <CardDescription className="text-xs uppercase tracking-wider">
              Total Cost
            </CardDescription>
            <CardTitle className="mt-1 flex items-center gap-2 text-foreground text-xl">
              <DollarSign className="icons" />
              {formatCurrency(totalCostValue, {
                noDecimals: true,
                noSymbol: true,
              })}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-primary bg-linear-to-br from-primary/5 to-primary/15">
          <CardHeader className="py-0">
            <CardDescription className="text-primary text-xs uppercase tracking-wider">
              Total Retail
            </CardDescription>
            <CardTitle className="mt-1 text-primary text-xl">
              <DollarSign className="icons" />
              {formatCurrency(totalSelectedValue, {
                noDecimals: true,
                noSymbol: true,
              })}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="outline">
          <Link
            href={`/portal/preview/proposal/${project.projectId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Eye className="size-4" />
            Preview Proposal
          </Link>
        </Button>
        {view === "list" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3 className="size-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-96 w-52 overflow-y-auto"
            >
              <DropdownMenuLabel>Column Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setColumnSizing({})}>
                <RotateCcw className="size-4" />
                Reset Widths
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {ITEM_COLUMN_OPTIONS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={columnVisibility[col.id]}
                  onCheckedChange={(checked) =>
                    setColumnVisibility((prev) => ({
                      ...prev,
                      [col.id]: !!checked,
                    }))
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as "grid" | "list")}
        >
          <TabsList>
            <TabsTrigger value="grid" aria-label="Grid view">
              <Grid />
            </TabsTrigger>
            <TabsTrigger value="list" aria-label="List view">
              <Rows3 />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Grid of Rooms */}
      {view === "grid" && (
        <FadeIn
          key="grid"
          className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-3"
        >
          {rooms.map((room) => {
            const itemsInRoom = roomItems.filter(
              (item) => item.roomId === room.roomId,
            );
            return (
              <Card variant="panel" key={room.roomId}>
                <CardHeader className="h-20!">
                  <div>
                    <CardTitle>
                      <LayoutGrid className="icons" />
                      {room.name}
                    </CardTitle>
                    {room.description && (
                      <CardDescription className="mt-0.5 font-light text-xs ml-6.5 line-clamp-2">
                        {room.description}
                      </CardDescription>
                    )}
                  </div>
                  <TooltipDropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="size-4" />
                        <span className="sr-only">Section actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => setActiveRoomForAddItems(room)}
                      >
                        <PlusCircle className="size-4" />
                        Add Item
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEditRoom(room)}>
                        <Edit className="size-4" />
                        Edit Section
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeletingRoom(room)}
                      >
                        <Trash2 className="size-4" />
                        Delete Section
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </TooltipDropdownMenu>
                </CardHeader>

                {/* Items List Inside Room */}
                <CardContent className="max-h-[850px] min-h-[600px] flex-1 overflow-y-auto p-0">
                  {itemsInRoom.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-4 py-12 text-center text-muted-foreground">
                      <ShoppingBag className="mb-2 size-8 text-muted-foreground/30" />
                      <p className="font-medium text-xs">
                        No items in section yet.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {itemsInRoom.map((item) => {
                        const parentVendor = vendors.find(
                          (v) => v.vendorId === item.vendorId,
                        );
                        return (
                          <div
                            key={item.roomItemId}
                            className="group flex items-center gap-3 p-4 transition-colors hover:bg-muted/20"
                          >
                            <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
                              {item.coverImageUrl ? (
                                <DashboardImage
                                  src={item.coverImageUrl}
                                  alt={item.name}
                                  sizes="48px"
                                  className="object-cover"
                                />
                              ) : (
                                <ShoppingBag className="size-5 text-muted-foreground/30" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate font-semibold text-foreground text-sm">
                                {item.name}
                              </h4>
                              <div className="mt-0.5 flex items-center gap-1.5 truncate text-muted-foreground text-xs">
                                {parentVendor && (
                                  <span className="truncate font-medium text-foreground/75">
                                    {parentVendor.name}
                                  </span>
                                )}
                                {parentVendor && item.sku && <span>•</span>}
                                {item.sku && (
                                  <span className="truncate font-mono">
                                    {item.sku}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-xs">
                                <span className="font-semibold text-primary">
                                  {formatCurrency(item.sellingPrice)}
                                </span>
                                <span className="text-muted-foreground/80">
                                  Qty: {item.quantity}
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => setEditingItem(item)}
                              >
                                <Pencil className="size-4" />
                                <span className="sr-only">Edit item</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeletingItem(item)}
                              >
                                <Trash2 className="size-4" />
                                <span className="sr-only">Delete item</span>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>

                {/* Actions Footer */}
                <CardFooter className="flex shrink-0 items-center justify-around h-16">
                  <div className="flex flex-col items-center gap-2 text-xl">
                    <Label>Items</Label>
                    {itemsInRoom.length}
                  </div>
                  <div className="flex flex-col items-center gap-2 text-xl">
                    <Label>Section Total</Label>
                    {formatCurrency(
                      itemsInRoom.reduce(
                        (acc, item) => acc + item.sellingPrice * item.quantity,
                        0,
                      ),
                      { noDecimals: true },
                    )}
                  </div>
                </CardFooter>
              </Card>
            );
          })}

          {/* Create Room Box trigger */}
          <Card
            onClick={openCreateRoom}
            className="group flex min-h-[300px] cursor-pointer flex-col items-center justify-center border-dashed p-8 text-center transition-all hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
              <FolderPlus className="size-6" />
            </div>
            <h3 className="font-semibold text-base text-foreground transition-colors group-hover:text-primary">
              Create Section
            </h3>
          </Card>
        </FadeIn>
      )}

      {/* List View — one table per section, draggable within and across sections */}
      {view === "list" && (
        <FadeIn key="list">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex flex-col gap-6">
              {rooms.map((room) => (
                <RoomListCard
                  key={room.roomId}
                  room={room}
                  items={roomItems.filter(
                    (item) => item.roomId === room.roomId,
                  )}
                  vendors={vendors}
                  visibleColumns={columnVisibility}
                  columnSizing={columnSizing}
                  onColumnSizingChange={setColumnSizing}
                  onEdit={openEditRoom}
                  onAddItem={setActiveRoomForAddItems}
                  onDelete={setDeletingRoom}
                  onEditItem={setEditingItem}
                  onDeleteItem={setDeletingItem}
                />
              ))}
              <Button
                variant="outline"
                onClick={openCreateRoom}
                className="w-fit gap-2 self-start"
              >
                <FolderPlus className="size-4" />
                Create Section
              </Button>
            </div>
          </DndContext>
        </FadeIn>
      )}

      {/* ---------------------------------------------------- */}
      {/* Create Room Dialog */}
      {/* ---------------------------------------------------- */}
      <Dialog
        open={isRoomDialogOpen}
        onOpenChange={(open) => {
          setIsRoomDialogOpen(open);
          if (!open) setEditingRoom(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {editingRoom ? "Edit Section" : "Create New Section"}
            </DialogTitle>
            <DialogDescription>
              Assign a section to organize specific items and services.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={roomForm.handleSubmit(onSubmitRoom)}
            className="space-y-4"
          >
            <Controller
              control={roomForm.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field
                  className="flex flex-col gap-1.5"
                  data-invalid={fieldState.invalid}
                >
                  <Label htmlFor="room-name">
                    Section Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="room-name"
                    placeholder="e.g. Living Room, Dining Room"
                    {...field}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              control={roomForm.control}
              name="description"
              render={({ field, fieldState }) => (
                <Field
                  className="flex flex-col gap-1.5"
                  data-invalid={fieldState.invalid}
                >
                  <Label htmlFor="room-description">
                    Description (Optional)
                  </Label>
                  <Textarea
                    id="room-description"
                    placeholder="e.g. Modern airy styling with custom flooring specifications."
                    className="min-h-[80px] resize-none"
                    {...field}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsRoomDialogOpen(false);
                  setEditingRoom(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                )}
                {editingRoom ? "Save Changes" : "Create Section"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------- */}
      {/* Add Items Dialog (Tabs: Catalog vs Custom) */}
      {/* ---------------------------------------------------- */}
      {activeRoomForAddItems && (
        <AddItemsDialog
          room={activeRoomForAddItems}
          projectId={project.projectId}
          organizationId={profile?.organizationId || ""}
          libraryItems={libraryItems}
          vendors={vendors}
          open={!!activeRoomForAddItems}
          onOpenChange={(open) => {
            if (!open) setActiveRoomForAddItems(null);
          }}
          onItemAdded={handleItemAdded}
        />
      )}

      {/* ---------------------------------------------------- */}
      {/* Edit Item Dialog */}
      {/* ---------------------------------------------------- */}
      {editingItem && (
        <EditItemDialog
          item={editingItem}
          open={!!editingItem}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null);
          }}
        />
      )}

      {/* ---------------------------------------------------- */}
      {/* Delete Item Confirmation */}
      {/* ---------------------------------------------------- */}
      <AlertDialog
        open={!!deletingItem}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
      >
        <AlertDialogContent className="bg-popover sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingItem?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this item from the section. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDeleteItem}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete Item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------------------------------------------------- */}
      {/* Delete Section Confirmation / Blocking Notice */}
      {/* ---------------------------------------------------- */}
      <AlertDialog
        open={!!deletingRoom}
        onOpenChange={(open) => {
          if (!open) setDeletingRoom(null);
        }}
      >
        <AlertDialogContent className="bg-popover sm:max-w-md">
          {deletingRoomItemCount > 0 ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  "{deletingRoom?.name}" isn't empty
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This section still has {deletingRoomItemCount} item
                  {deletingRoomItemCount === 1 ? "" : "s"}. Move them to another
                  section or delete them first, then you can delete the section.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Got it</AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete "{deletingRoom?.name}"?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove this empty section. This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={handleConfirmDeleteRoom}
                  disabled={isDeleting}
                  className="gap-2"
                >
                  {isDeleting && <Loader2 className="size-4 animate-spin" />}
                  Delete Section
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </FadeIn>
  );
}
