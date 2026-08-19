"use client";

import { useEffect, useState } from "react";

import { collection, onSnapshot, query, where } from "firebase/firestore";

import { sortTasksByDue } from "@/lib/db";
import { db } from "@/lib/firebase";
import type { Task } from "@/lib/types";

/**
 * Live open tasks.
 *
 * One listener serves all three views. Admins subscribe org-wide (they're the
 * only ones with an All Tasks view) and members subscribe participant-scoped —
 * the array-contains clause is required by firestore.rules, not a nicety: an
 * unconstrained member query is rejected outright. Per-view narrowing then
 * happens in memory, so switching views costs nothing.
 *
 * Keyed on the stable primitives from useAuth, never the profile object, whose
 * identity churns on every heartbeat (see clients/page.test.tsx).
 */
export function useTasks(
  organizationId: string | null,
  uid: string | null,
  isAdmin: boolean,
  authLoading: boolean,
) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !organizationId || !uid) return;

    const constraints = [
      where("organizationId", "==", organizationId),
      where("completed", "==", false),
    ];
    if (!isAdmin)
      constraints.push(where("participantIds", "array-contains", uid));

    const unsubscribe = onSnapshot(
      query(collection(db, "tasks"), ...constraints),
      (snapshot) => {
        setTasks(sortTasksByDue(snapshot.docs.map((d) => d.data() as Task)));
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load tasks:", error);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [organizationId, uid, isAdmin, authLoading]);

  return { tasks, loading };
}
