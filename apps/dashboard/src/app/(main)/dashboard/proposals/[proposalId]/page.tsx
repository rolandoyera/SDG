"use client";

import { useEffect, useMemo, useState } from "react";

import Image from "next/image";
import { useParams } from "next/navigation";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical, PanelRight, Plus, Trash2, X } from "lucide-react";

import {
  ArmchairIcon,
  CoffeeTableIcon,
  ConsoleTableIcon,
  RugIcon,
  SofaIcon,
} from "@/components/icons/furniture-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";

const UNIT_TYPES = [
  "Each",
  "Per Ft",
  "Per Sq Ft",
  "Per Yd",
  "Lump Sum",
] as const;
type UnitType = (typeof UNIT_TYPES)[number];

interface LineItem {
  id: string;
  subcategory: string;
  name?: string;
  materials?: string;
  finishColor?: string;
  room: string;
  description?: string;
  dimensions?: string;
  unitType: UnitType;
  qty: number;
  sellingPrice: number;
  iconType: "sofa" | "armchair" | "table" | "rug" | "console";
}

/** Maps an item's iconType to its furniture icon component. */
const ICON_BY_TYPE: Record<LineItem["iconType"], typeof SofaIcon> = {
  sofa: SofaIcon,
  armchair: ArmchairIcon,
  table: CoffeeTableIcon,
  console: ConsoleTableIcon,
  rug: RugIcon,
};

const INITIAL_ITEMS: LineItem[] = [
  {
    id: "item-1",
    subcategory: "Sofa",
    name: "Gregory Sectional",
    materials: "Leather & Brass",
    finishColor: "Cream",
    room: "Living Room",
    description:
      "Cream leather / taupe accents. Tone-on-tone stitching 143. Brass details.",
    dimensions: "168″ W × 77″ D × 35″ H",
    unitType: "Each",
    qty: 1,
    sellingPrice: 16818,
    iconType: "sofa",
  },
  {
    id: "item-2",
    subcategory: "Sofa",
    name: "Gregory Sectional",
    materials: "Leather & Brass",
    finishColor: "Cream",
    room: "Living Room",
    description:
      "Cream leather / taupe accents. Tone-on-tone stitching 143. Brass details.",
    dimensions: "168″ W × 77″ D × 35″ H",
    unitType: "Each",
    qty: 1,
    sellingPrice: 16818,
    iconType: "sofa",
  },
];

/** Per-room dimensions, keyed by room name. */
const ROOM_DIMENSIONS: Record<string, string> = {
  "Living Room": "23′ × 15′–8″",
};

interface SortableRowProps {
  item: LineItem;
  onDelete: (id: string) => void;
  renderIcon: (type: LineItem["iconType"]) => React.ReactNode;
}

function SortableRow({ item, onDelete, renderIcon }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
  });

  // Apply the sort transform/transition to the row itself (the measured node) so the
  // dragged row stays perfectly column-aligned. When active, lift it above its neighbors.
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        isDragging &&
          "relative z-10 bg-white! shadow-[0_12px_30px_rgba(60,50,40,0.15)] dark:bg-white/20!",
      )}>
      {/* Grip Handle Cell */}
      <TableCell className="px-4 py-5">
        <div
          {...attributes}
          {...listeners}
          className="drag-handle flex cursor-grab touch-none items-center justify-center p-1 text-muted-foreground/30 hover:text-muted-foreground active:cursor-grabbing">
          <GripVertical className="size-4" />
        </div>
      </TableCell>
      <TableCell className="px-4 py-5">
        <div className="thumb flex size-14 shrink-0 items-center justify-center rounded border bg-muted/50">
          <span className="text-muted-foreground">
            {renderIcon(item.iconType)}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4 py-5">
        <div className="flex items-center gap-3.5">
          <div>
            <div className="font-serif text-foreground text-sm">
              {item.subcategory}
            </div>
            {item.name && (
              <div className="text-[12px] text-muted-foreground">
                {item.name}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-5">
        <span className="text-[12px] text-muted-foreground">
          {item.materials ?? "—"}
        </span>
      </TableCell>
      <TableCell className="px-4 py-5">
        <span className="text-[12px] text-muted-foreground">
          {item.finishColor ?? "—"}
        </span>
      </TableCell>
      <TableCell className="px-4 py-5">
        <p className="max-w-80 text-ellipsis text-[12px] text-muted-foreground">
          {item.description ?? "—"}
        </p>
      </TableCell>
      <TableCell
        className="text-[12px] text-muted-foreground"
        style={{ textAlign: "left" }}>
        {item.dimensions ?? "—"}
      </TableCell>
      <TableCell
        className="text-[12px] text-muted-foreground"
        style={{ textAlign: "left" }}>
        {item.unitType}
      </TableCell>
      <TableCell className="text-right text-[12px] text-muted-foreground">
        {item.qty}
      </TableCell>
      <TableCell className="text-right text-[12px] text-muted-foreground">
        {formatCurrency(item.sellingPrice, { noDecimals: true })}
      </TableCell>
      <TableCell className="text-right text-[12px] text-muted-foreground">
        {formatCurrency(item.sellingPrice * item.qty, { noDecimals: true })}
      </TableCell>
      {/* Action Delete Cell */}
      <TableCell>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => onDelete(item.id)}
          className="bg-destructive/10 opacity-20 transition-all hover:text-destructive hover:opacity-100">
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * Reorder a single room's items within the flat list, keeping every room's slots
 * in place. Safe even when rooms are interleaved in the global array.
 */
function reorderWithinRoom(
  items: LineItem[],
  room: string,
  activeId: string,
  overId: string,
): LineItem[] {
  const positions: number[] = [];
  items.forEach((it, idx) => {
    if (it.room === room) positions.push(idx);
  });
  const roomItems = positions.map((p) => items[p]);
  const oldIndex = roomItems.findIndex((it) => it.id === activeId);
  const newIndex = roomItems.findIndex((it) => it.id === overId);
  if (oldIndex === -1 || newIndex === -1) return items;

  const newOrder = arrayMove(roomItems, oldIndex, newIndex);
  const result = [...items];
  positions.forEach((p, k) => {
    result[p] = newOrder[k];
  });
  return result;
}

interface RoomSectionProps {
  room: string;
  items: LineItem[];
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (room: string, event: DragEndEvent) => void;
  onDelete: (id: string) => void;
  renderIcon: (type: LineItem["iconType"]) => React.ReactNode;
}

/** A single room: its own sortable table and subtotal footer. */
function RoomSection({
  room,
  items,
  sensors,
  onDragEnd,
  onDelete,
  renderIcon,
}: RoomSectionProps) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.sellingPrice * item.qty,
    0,
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <Button type="button" className="ml-auto w-fit" variant="secondary">
          <Plus className="size-4" /> Add Line Item
        </Button>
      </CardHeader>
      <CardContent>
        {/* Section Header */}
        <div className="flex items-center justify-between border-border border-b px-9 py-6">
          <div className="flex items-baseline gap-4">
            <span className="font-light font-serif text-2xl italic tracking-tight">
              {room}
            </span>
            <span className="font-light text-[11px] tracking-[0.14em]">
              {ROOM_DIMENSIONS[room] ??
                `${items.length} ${items.length === 1 ? "item" : "items"}`}
            </span>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={(event) => onDragEnd(room, event)}>
          <Table>
            <TableHeader>
              <TableRow className="px-4 py-3.5 text-xs uppercase tracking-widest">
                <TableHead className="w-10" />
                <TableHead className="w-16" />
                <TableHead style={{ width: "180px" }}>Item</TableHead>
                <TableHead style={{ width: "100px" }}>Materials</TableHead>
                <TableHead style={{ width: "120px" }}>Color</TableHead>
                <TableHead>Description</TableHead>
                <TableHead style={{ width: "230px" }}>Dimensions</TableHead>
                <TableHead style={{ width: "90px" }}>Unit</TableHead>
                <TableHead className="w-10">Qty</TableHead>
                <TableHead className="w-20 text-right">Price</TableHead>
                <TableHead className="w-24 text-right">Total</TableHead>
                <TableHead style={{ width: "50px" }} />
              </TableRow>
            </TableHeader>
            <SortableContext
              items={items.map((item) => item.id)}
              strategy={verticalListSortingStrategy}>
              <TableBody className="border-b-0">
                {items.map((item) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    onDelete={onDelete}
                    renderIcon={renderIcon}
                  />
                ))}
              </TableBody>
            </SortableContext>
          </Table>
        </DndContext>
      </CardContent>

      <CardFooter className="flex items-center justify-end gap-18">
        <div className="text-right">
          <Label className="mb-1 font-light uppercase tracking-widest">
            Items
          </Label>
          <div className="font-light font-serif text-2xl tabular-nums">
            {items.length}
          </div>
        </div>
        <div className="h-9 w-px bg-border" />
        <div className="text-right">
          <Label className="mb-1 font-light uppercase tracking-widest">
            Section Total
          </Label>
          <div className="font-light font-serif text-2xl tabular-nums">
            {formatCurrency(subtotal, { noDecimals: true })}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

export default function ProposalDetailPage() {
  const params = useParams();
  const proposalId = params?.proposalId as string;

  const [items, setItems] = useState<LineItem[]>(INITIAL_ITEMS);

  const { open, setOpen, openMobile, setOpenMobile, isMobile } = useSidebar();
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [wasLeftSidebarOpen, setWasLeftSidebarOpen] = useState(false);

  const toggleRightSidebar = () => {
    if (rightSidebarOpen) {
      if (!isMobile && wasLeftSidebarOpen) {
        setOpen(true);
      }
      setRightSidebarOpen(false);
      setWasLeftSidebarOpen(false);
    } else {
      if (isMobile) {
        if (openMobile) {
          setOpenMobile(false);
        }
      } else {
        if (open) {
          setWasLeftSidebarOpen(true);
          setOpen(false);
        } else {
          setWasLeftSidebarOpen(false);
        }
      }
      setRightSidebarOpen(true);
    }
  };

  const closeRightSidebar = () => {
    if (!isMobile && wasLeftSidebarOpen) {
      setOpen(true);
    }
    setRightSidebarOpen(false);
    setWasLeftSidebarOpen(false);
  };

  // Enforce single active sidebar logic
  useEffect(() => {
    if (rightSidebarOpen) {
      if (isMobile && openMobile) {
        setRightSidebarOpen(false);
        setWasLeftSidebarOpen(false);
      } else if (!isMobile && open) {
        setRightSidebarOpen(false);
        setWasLeftSidebarOpen(false);
      }
    }
  }, [open, openMobile, isMobile, rightSidebarOpen]);

  // Group items into rooms (preserving first-appearance order), then total everything.
  const rooms = useMemo(() => {
    const order: string[] = [];
    const byRoom = new Map<string, LineItem[]>();
    for (const item of items) {
      const existing = byRoom.get(item.room);
      if (existing) {
        existing.push(item);
      } else {
        byRoom.set(item.room, [item]);
        order.push(item.room);
      }
    }
    return order.map((room) => ({
      room,
      items: byRoom.get(room) as LineItem[],
    }));
  }, [items]);

  const grandTotal = items.reduce(
    (sum, item) => sum + item.sellingPrice * item.qty,
    0,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  // Reordering is scoped to the room the drag started in.
  const handleDragEnd = (room: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) =>
      reorderWithinRoom(prev, room, active.id as string, over.id as string),
    );
  };

  // CRUD actions
  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const renderIcon = (type: LineItem["iconType"]) => {
    const Icon = ICON_BY_TYPE[type];
    return <Icon size={22} strokeWidth={1.3} />;
  };

  return (
    <div
      data-right-sidebar-open={rightSidebarOpen && !isMobile ? "true" : "false"}
      className="proposal-page-container relative h-full w-full bg-card transition-[padding-right] duration-200 ease-linear"
      style={{
        paddingRight:
          rightSidebarOpen && !isMobile
            ? "calc(var(--spacing) * 90)"
            : undefined,
      }}>
      {/* Right Sidebar Toggle Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={toggleRightSidebar}
        className="fixed top-[72px] right-6 z-50 h-9 w-9 border border-border bg-sidebar text-sidebar-foreground shadow-sm transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        {rightSidebarOpen ? (
          <X className="size-4" />
        ) : (
          <PanelRight className="size-4" />
        )}
      </Button>

      {/* Mobile Backdrop */}
      {rightSidebarOpen && isMobile && (
        <button
          type="button"
          aria-label="Close Sidebar"
          className="fixed inset-0 z-40 border-none bg-background/80 outline-none backdrop-blur-sm lg:hidden"
          onClick={closeRightSidebar}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-90 transform flex-col border-border border-l bg-sidebar pt-14 text-sidebar-foreground shadow-sm transition-transform duration-200 ease-linear lg:top-[56px] lg:right-[9px] lg:bottom-[12px] lg:rounded-br-lg lg:pt-0",
          rightSidebarOpen ? "translate-x-0" : "translate-x-full",
        )}>
        <div className="flex h-12 shrink-0 items-center px-6">
          <span className="font-light font-serif text-foreground text-lg italic">
            Actions
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {/* Empty for the moment */}
        </div>
      </aside>

      {/* Header */}
      <header className="mb-12 flex items-start justify-between">
        <div>
          <div className="mb-2 flex size-11 items-center justify-center">
            {/* Company Logo Here */}
            <Image
              src="/logo_sdg-S-only.svg"
              alt="Logo"
              width={54}
              height={54}
              className="dark:invert"
            />
          </div>
          <div className="text-foreground">Fallback Co. Name</div>
        </div>

        <div className="flex flex-col gap-1 text-foreground">
          <div className="grid grid-cols-2 gap-2">
            <Label size="large">Client</Label>
            <span>Anna Birman</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Label size="large">Address</Label>
            <span>123 Main St</span>
          </div>
          <div className="-mt-2 grid grid-cols-2 gap-2">
            <Label size="large" />
            <span>Toronto, ON 55555</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Label size="large">Project #</Label>
            <span>{proposalId || "0"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Label size="large">Budget</Label>
            <span>$85,000.00</span>
          </div>
          <Separator className="w-full bg-accent-foreground/15" />
          <div className="grid grid-cols-2 gap-2">
            <Label size="large">Total</Label>
            <span>{formatCurrency(grandTotal, { noDecimals: true })}</span>
          </div>
        </div>
      </header>

      {/* Rooms — one sortable table per room */}
      {rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
          <p className="font-medium text-(--text-secondary) text-sm">
            No line items yet
          </p>
          <p className="max-w-[280px] text-(--text-tertiary) text-xs">
            Use “Add Line Item” to start building out rooms for this proposal.
          </p>
          <Button type="button" variant="secondary">
            <Plus className="size-4" /> Add Line Item
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {rooms.map(({ room, items: roomItems }) => (
            <RoomSection
              key={room}
              room={room}
              items={roomItems}
              sensors={sensors}
              onDragEnd={handleDragEnd}
              onDelete={handleDeleteItem}
              renderIcon={renderIcon}
            />
          ))}
        </div>
      )}
    </div>
  );
}
