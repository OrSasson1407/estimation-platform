// FIX #12: Removed updateTaskStatus from destructure and dependency array.
// The socket has no task:status_changed handler so updateTaskStatus was dead
// weight causing the effect to re-run unnecessarily on every store change.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { joinProjectRoom, leaveProjectRoom, getSocket } from "../services/socket";

export const useRealTimeUpdates = (projectId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;

    joinProjectRoom(projectId);
    const socket = getSocket();

    socket.on("estimation:updated", (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["estimations", data.taskId] });
    });

    socket.on("risk:alert", () => {
      queryClient.invalidateQueries({ queryKey: ["risks", projectId] });
    });

    socket.on("sprint:rebalanced", () => {
      queryClient.invalidateQueries({ queryKey: ["sprints", projectId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    });

    socket.on("simulation:result", (data: any) => {
      queryClient.setQueryData(["simulation", data.simulationId], data);
    });

    socket.on("anomaly:detected", () => {
      queryClient.invalidateQueries({ queryKey: ["risks", projectId] });
    });

    return () => {
      socket.off("estimation:updated");
      socket.off("risk:alert");
      socket.off("sprint:rebalanced");
      socket.off("simulation:result");
      socket.off("anomaly:detected");
      leaveProjectRoom(projectId);
    };
  }, [projectId, queryClient]);
};
