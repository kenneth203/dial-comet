import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval } from "date-fns";

interface CoverageData {
  date: string;
  timeSlot: string;
  planned: number;
  target: number;
  actual: number;
}

export function CoverageHeatmap() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [coverageData, setCoverageData] = useState<CoverageData[]>([]);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Time slots for the heatmap (30-minute intervals from 9 AM to 5 PM)
  const timeSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30'
  ];

  useEffect(() => {
    // Generate mock data - in real implementation, this would fetch from database
    const mockData: CoverageData[] = [];
    
    weekDays.forEach(day => {
      timeSlots.forEach(slot => {
        const target = Math.floor(Math.random() * 3) + 2; // 2-4 target staff
        const planned = Math.floor(Math.random() * 4) + 1; // 1-4 planned staff
        const actual = Math.floor(Math.random() * 4) + 1; // 1-4 actual staff
        
        mockData.push({
          date: format(day, 'yyyy-MM-dd'),
          timeSlot: slot,
          planned,
          target,
          actual
        });
      });
    });
    
    setCoverageData(mockData);
  }, [currentWeek]);

  const getCoverageColor = (planned: number, target: number) => {
    const ratio = planned / target;
    if (ratio >= 1) return 'bg-green-500'; // Fully covered
    if (ratio >= 0.8) return 'bg-yellow-500'; // Mostly covered
    return 'bg-red-500'; // Under covered
  };

  const getCoverageIntensity = (planned: number, target: number) => {
    const ratio = planned / target;
    if (ratio >= 1.2) return 'opacity-100'; // Over covered
    if (ratio >= 1) return 'opacity-80'; // Fully covered
    if (ratio >= 0.8) return 'opacity-60'; // Mostly covered
    return 'opacity-40'; // Under covered
  };

  const getDataForSlot = (date: string, timeSlot: string) => {
    return coverageData.find(d => d.date === date && d.timeSlot === timeSlot);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Coverage Heatmap
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Planned vs target staffing levels for {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
        </p>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>Fully Covered (100%+)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <span>Mostly Covered (80-99%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span>Under Covered (&lt;80%)</span>
            </div>
          </div>
          
          {/* Heatmap Grid */}
          <div className="overflow-x-auto">
            <div className="grid grid-cols-8 gap-1 min-w-[800px]">
              {/* Header Row */}
              <div className="p-2 text-sm font-medium text-muted-foreground">Time</div>
              {weekDays.map((day, index) => (
                <div key={index} className="p-2 text-center text-sm font-medium">
                  <div>{format(day, 'EEE')}</div>
                  <div className="text-xs text-muted-foreground">{format(day, 'd')}</div>
                </div>
              ))}
              
              {/* Data Rows */}
              {timeSlots.map((slot) => (
                <React.Fragment key={slot}>
                  <div className="p-2 text-sm font-medium text-muted-foreground">
                    {slot}
                  </div>
                  {weekDays.map((day, dayIndex) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const slotData = getDataForSlot(dateStr, slot);
                    
                    if (!slotData) {
                      return <div key={dayIndex} className="p-2 bg-muted/20 rounded" />;
                    }
                    
                    return (
                      <div
                        key={dayIndex}
                        className={`p-2 rounded cursor-pointer transition-all hover:scale-105 ${
                          getCoverageColor(slotData.planned, slotData.target)
                        } ${getCoverageIntensity(slotData.planned, slotData.target)}`}
                        title={`${slot}: ${slotData.planned}/${slotData.target} staff`}
                      >
                        <div className="text-xs text-white font-medium text-center">
                          {slotData.planned}/{slotData.target}
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
          
          {/* Summary Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
            {weekDays.map((day, index) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayData = coverageData.filter(d => d.date === dateStr);
              
              const totalPlanned = dayData.reduce((sum, d) => sum + d.planned, 0);
              const totalTarget = dayData.reduce((sum, d) => sum + d.target, 0);
              const coverageRatio = totalTarget > 0 ? (totalPlanned / totalTarget) * 100 : 0;
              
              return (
                <div key={index} className="text-center">
                  <div className="text-sm font-medium">{format(day, 'EEE d')}</div>
                  <div className="text-lg font-bold">{coverageRatio.toFixed(0)}%</div>
                  <Badge 
                    variant={coverageRatio >= 100 ? "default" : coverageRatio >= 80 ? "secondary" : "destructive"}
                    className="text-xs"
                  >
                    {totalPlanned}/{totalTarget}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}