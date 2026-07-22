import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, MapPin, RotateCcw, ExternalLink, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isBlockedMapHost, isValidNonBlockedMapUrl } from "@/lib/utils";

interface Location {
  id: string;
  name: string;
  google_maps_url?: string;
  notes?: string;
}

interface MultiLocationManagerProps {
  locations: Location[];
  customerName: string;
  onLocationsChange: (locations: Location[]) => void;
}

export function MultiLocationManager({ locations, customerName, onLocationsChange }: MultiLocationManagerProps) {
  const { toast } = useToast();
  const [activeLocation, setActiveLocation] = useState<string>('0');

  // Generate unique ID for new locations
  const generateLocationId = () => `location-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Add a new location
  const addLocation = () => {
    if (locations.length >= 5) {
      toast({
        title: "Maximum Locations Reached",
        description: "You can add up to 5 locations per customer.",
        variant: "destructive"
      });
      return;
    }

    const newLocation: Location = {
      id: generateLocationId(),
      name: `Location ${locations.length + 1}`,
      google_maps_url: '',
      notes: ''
    };

    const updatedLocations = [...locations, newLocation];
    onLocationsChange(updatedLocations);
    setActiveLocation((locations.length).toString());

    toast({
      title: "Location Added",
      description: `Added new location slot ${locations.length + 1}.`
    });
  };

  // Remove a location
  const removeLocation = (index: number) => {
    if (locations.length <= 1) {
      toast({
        title: "Cannot Remove",
        description: "You must have at least one location.",
        variant: "destructive"
      });
      return;
    }

    const updatedLocations = locations.filter((_, i) => i !== index);
    onLocationsChange(updatedLocations);

    // Adjust active tab if necessary
    const newActiveIndex = Math.min(parseInt(activeLocation), updatedLocations.length - 1);
    setActiveLocation(newActiveIndex.toString());

    toast({
      title: "Location Removed",
      description: "Location has been removed successfully."
    });
  };

  // Update a specific location
  const updateLocation = (index: number, field: keyof Location, value: string) => {
    const updatedLocations = [...locations];
    updatedLocations[index] = { ...updatedLocations[index], [field]: value };
    onLocationsChange(updatedLocations);
  };

  // Reset all locations to clean slate
  const resetLocations = () => {
    const defaultLocation: Location = {
      id: generateLocationId(),
      name: 'Main Location',
      google_maps_url: '',
      notes: ''
    };
    onLocationsChange([defaultLocation]);
    setActiveLocation('0');

    toast({
      title: "Locations Reset",
      description: "All locations have been reset to default state."
    });
  };

  // Ensure we have at least one location
  const ensureMinimumLocations = () => {
    if (locations.length === 0) {
      const defaultLocation: Location = {
        id: generateLocationId(),
        name: 'Main Location',
        google_maps_url: '',
        notes: ''
      };
      onLocationsChange([defaultLocation]);
    }
  };

  // Initialize with at least one location
  React.useEffect(() => {
    ensureMinimumLocations();
  }, []);

  const currentLocations = locations.length > 0 ? locations : [{
    id: generateLocationId(),
    name: 'Main Location',
    google_maps_url: '',
    notes: ''
  }];

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h3 className="text-lg font-semibold">Customer Locations</h3>
          <p className="text-sm text-muted-foreground">
            Manage up to 5 locations for {customerName} ({currentLocations.length}/5)
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            type="button" 
            onClick={resetLocations} 
            size="sm" 
            variant="outline"
            className="text-destructive hover:text-destructive"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button 
            type="button" 
            onClick={addLocation} 
            size="sm" 
            variant="outline"
            disabled={currentLocations.length >= 5}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </Button>
        </div>
      </div>

      {/* Locations Tabs */}
      <Tabs value={activeLocation} onValueChange={setActiveLocation} className="w-full">
        <div className="overflow-x-auto -mx-0">
        <TabsList className="grid w-full min-w-max sm:min-w-0" style={{ gridTemplateColumns: `repeat(${Math.min(currentLocations.length, 5)}, minmax(0, 1fr))` }}>
          {currentLocations.map((location, index) => (
            <TabsTrigger key={location.id} value={index.toString()} className="relative">
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <span className="truncate max-w-[100px]">{location.name || `Location ${index + 1}`}</span>
                {location.google_maps_url && isValidUrl(location.google_maps_url) && (
                  <Badge variant="secondary" className="h-4 w-4 p-0 rounded-full">
                    <span className="sr-only">Has map link</span>
                  </Badge>
                )}
              </div>
            </TabsTrigger>
          ))}
        </TabsList>
        </div>


        {currentLocations.map((location, index) => (
          <TabsContent key={location.id} value={index.toString()} className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                  <CardTitle>
                    Location {index + 1} Details
                  </CardTitle>
                  {currentLocations.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLocation(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Location Name */}
                <div className="space-y-2">
                  <Label htmlFor={`location-name-${index}`}>Location Name</Label>
                  <Input
                    id={`location-name-${index}`}
                    value={location.name}
                    onChange={(e) => updateLocation(index, 'name', e.target.value)}
                    placeholder="e.g., Main Office, Branch Office, Clinic A"
                  />
                </div>

                {/* Map Link */}
                <div className="space-y-2">
                  <Label htmlFor={`map-link-${index}`}>Map Link</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`map-link-${index}`}
                      value={location.google_maps_url || ''}
                      onChange={(e) => updateLocation(index, 'google_maps_url', e.target.value)}
                      placeholder="Paste any map link (Google Maps, Apple Maps, etc.)"
                      className="flex-1"
                    />
                    {location.google_maps_url && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBlockedMapHost(location.google_maps_url)}
                        onClick={() => {
                          if (isValidNonBlockedMapUrl(location.google_maps_url || '')) {
                            window.open(location.google_maps_url, '_blank', 'noopener,noreferrer');
                            toast({
                              title: "Link verified",
                              description: "Map link opened successfully",
                            });
                          } else {
                            toast({
                              title: "Invalid URL",
                              description: "Please enter a valid URL starting with http:// or https://",
                              variant: "destructive"
                            });
                          }
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {location.google_maps_url && isBlockedMapHost(location.google_maps_url) && (
                    <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <p className="text-xs text-destructive">
                        This Google Maps link may be blocked. Consider using maps.app.goo.gl or Apple Maps instead.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    This link will be used by agents when they need to open the location in maps.
                  </p>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor={`notes-${index}`}>Location Notes</Label>
                  <Textarea
                    id={`notes-${index}`}
                    value={location.notes || ''}
                    onChange={(e) => updateLocation(index, 'notes', e.target.value)}
                    placeholder="Special instructions, parking info, entrance details, etc."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Quick Access Summary */}
      {currentLocations.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Quick Access - All Locations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {currentLocations.map((location, index) => {
                // Only show if location has a valid map URL that's not blocked
                const mapUrl = location.google_maps_url;
                
                return mapUrl && isValidNonBlockedMapUrl(mapUrl) ? (
                  <div key={location.id} className="flex gap-1">
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 flex-1 justify-start"
                      title={`Open ${location.name} in Maps`}
                    >
                      <MapPin className="h-3 w-3 mr-1" />
                      <span className="truncate">{location.name}</span>
                    </a>
                  </div>
                ) : null;
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}