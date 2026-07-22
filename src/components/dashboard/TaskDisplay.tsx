import { Badge } from "@/components/ui/badge";
import { useUsers } from "@/context/UsersContext";
import { useCustomers } from "@/context/CustomersContext";
import { useTasks, type TMTask, type TMStatus } from "@/context/TasksContext";

interface TaskDisplayProps {
  showAddForm?: boolean;
}

export default function TaskDisplay({ showAddForm = false }: TaskDisplayProps) {
  const { users } = useUsers();
  const { customers } = useCustomers();
  const { tasks } = useTasks();

  const getAssigneeName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unassigned";
  const getCustomerName = (id: string) => {
    if (!id || id.trim() === "") return "Unassigned Customer";
    const customer = customers.find((c) => c.id === id);
    return customer?.name ?? "Unassigned Customer";
  };

  // Group tasks by customer
  const groupedTasks = tasks.reduce((acc, task) => {
    const customerName = getCustomerName(task.customerId);
    if (!acc[customerName]) {
      acc[customerName] = [];
    }
    acc[customerName].push(task);
    return acc;
  }, {} as Record<string, TMTask[]>);

  const statusBadge = (s: TMStatus) => {
    switch (s) {
      case "new_task":
        return <Badge className="bg-red-500 text-white border-red-600 text-xs">New Task</Badge>;
      case "pending":
        return <Badge className="bg-amber-500 text-white border-amber-600 text-xs">Pending</Badge>;
      case "in_progress":
        return <Badge className="bg-green-400 text-green-900 border-green-500 text-xs">In Progress</Badge>;
      case "completed":
        return <Badge className="bg-gray-400 text-white border-gray-500 text-xs">Completed</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {Object.entries(groupedTasks).map(([customerName, customerTasks]) => (
        <div key={customerName} className="space-y-2">
          <h4 className="font-semibold text-sm text-primary border-b border-border/50 pb-1">
            {customerName}
          </h4>
          <div className="space-y-1 text-sm">
            {customerTasks.map((task) => (
              <div key={task.id} className="flex justify-between items-start gap-2 py-1">
                <span className={`flex-1 ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                  {getAssigneeName(task.assigneeId)} - {task.title}
                </span>
                <div className="flex-shrink-0">
                  {statusBadge(task.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      
      {Object.keys(groupedTasks).length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-4">
          No tasks available.
        </div>
      )}
    </div>
  );
}