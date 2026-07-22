/// <reference types="google.maps" />
import React, { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, Navigation, Search, ExternalLink, Phone, AlertCircle, Building } from "lucide-react";
import { Loader } from "@googlemaps/js-api-loader";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface GoogleMapsLocationCardProps {
  address: string;
  customerName: string;
  onAddressChange: (address: string) => void;
  googleMapsUrl?: string;
}

export function GoogleMapsLocationCard({ address, customerName, onAddressChange, googleMapsUrl }: GoogleMapsLocationCardProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [marker, setMarker] = useState<google.maps.Marker | null>(null);
  const [searchInput, setSearchInput] = useState(address);
  const [isLoading, setIsLoading] = useState(false);
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null);
  const [placesService, setPlacesService] = useState<google.maps.places.PlacesService | null>(null);
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Update search input when address prop changes
  useEffect(() => {
    setSearchInput(address);
  }, [address]);

  // Initialize Google Maps
  useEffect(() => {
    const initializeMap = async () => {
      try {
        // Fetch the Google Maps API key from our secure edge function
        const { data, error } = await supabase.functions.invoke('get-google-maps-key');
        
        if (error) {
          console.error('Failed to fetch Google Maps API key:', error);
          setHasApiKey(false);
          return;
        }
        
        const { apiKey } = data;
        
        if (!apiKey) {
          setHasApiKey(false);
          return;
        }

        setHasApiKey(true);
        const loader = new Loader({
          apiKey: apiKey,
          version: "weekly",
          libraries: ["places", "geometry"]
        });

        const { Map } = await loader.importLibrary("maps") as google.maps.MapsLibrary;
        const { Marker } = await loader.importLibrary("marker") as google.maps.MarkerLibrary;

        if (mapRef.current) {
          const mapInstance = new Map(mapRef.current, {
            center: { lat: 51.5074, lng: -0.1278 }, // Default to London
            zoom: 13,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
          });

          setMap(mapInstance);

          // Initialize Places services
          const autoComplete = new google.maps.places.AutocompleteService();
          const places = new google.maps.places.PlacesService(mapInstance);
          setAutocompleteService(autoComplete);
          setPlacesService(places);

          // If there's an initial address, geocode it
          if (address.trim()) {
            geocodeAddress(address, mapInstance);
          }
        }
      } catch (error) {
        console.error("Error loading Google Maps:", error);
        setHasApiKey(false);
        toast({
          title: "Maps Error",
          description: "Error loading Google Maps. Please check your API key.",
          variant: "destructive"
        });
      }
    };

    initializeMap();
  }, []);

  // Geocode address and place marker
  const geocodeAddress = async (addressToGeocode: string, mapInstance?: google.maps.Map) => {
    if (!addressToGeocode.trim()) return;

    setIsLoading(true);
    const geocoder = new google.maps.Geocoder();
    const targetMap = mapInstance || map;

    if (!targetMap) return;

    try {
      const result = await geocoder.geocode({ address: addressToGeocode });
      
      if (result.results && result.results[0]) {
        const location = result.results[0].geometry.location;
        
        // Center map on location
        targetMap.setCenter(location);
        targetMap.setZoom(16);

        // Remove existing marker
        if (marker) {
          marker.setMap(null);
        }

        // Add new marker
        const newMarker = new google.maps.Marker({
          position: location,
          map: targetMap,
          title: `${customerName} - ${addressToGeocode}`,
          animation: google.maps.Animation.DROP
        });

        setMarker(newMarker);

        // Update address if it was improved by geocoding
        const formattedAddress = result.results[0].formatted_address;
        onAddressChange(formattedAddress);
        setSearchInput(formattedAddress);

        toast({
          title: "Location Found",
          description: `Successfully located ${customerName}'s address.`
        });
      } else {
        toast({
          title: "Address Not Found",
          description: "Could not find this address. Please try a more specific address.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      toast({
        title: "Geocoding Error", 
        description: "Error finding address location.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle address search with autocomplete
  const handleAddressSearch = (query: string) => {
    setSearchInput(query);
    
    if (autocompleteService && query.length > 2) {
      autocompleteService.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: 'GB' }, // UK only
          types: ['establishment', 'geocode']
        },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            setPredictions(predictions.slice(0, 5)); // Limit to 5 suggestions
          } else {
            setPredictions([]);
          }
        }
      );
    } else {
      setPredictions([]);
    }
  };

  // Select prediction and geocode
  const selectPrediction = (prediction: google.maps.places.AutocompletePrediction) => {
    setSearchInput(prediction.description);
    setPredictions([]);
    geocodeAddress(prediction.description);
  };

  // Get directions to location (function no longer needed as we use direct anchor links)

  // Search nearby clinics/medical facilities
  const findNearbyClinics = () => {
    if (!map || !placesService) return;

    const request = {
      location: map.getCenter()!,
      radius: 2000, // 2km radius
      type: 'hospital' as string,
      keyword: 'clinic medical centre GP practice'
    };

    placesService.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        // Clear existing markers except main one
        // Add markers for nearby clinics
        results.slice(0, 10).forEach((place, index) => {
          if (place.geometry?.location) {
            const clinicMarker = new google.maps.Marker({
              position: place.geometry.location,
              map: map,
              title: place.name,
              icon: {
                url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
                scaledSize: new google.maps.Size(25, 25)
              }
            });

            // Add info window
            const infoWindow = new google.maps.InfoWindow({
              content: `
                <div style="padding: 8px;">
                  <strong>${place.name}</strong><br>
                  ${place.vicinity}<br>
                  ${place.rating ? `Rating: ${place.rating}/5` : ''}
                  ${place.formatted_phone_number ? `<br>Phone: ${place.formatted_phone_number}` : ''}
                </div>
              `
            });

            clinicMarker.addListener('click', () => {
              infoWindow.open(map, clinicMarker);
            });
          }
        });

        toast({
          title: "Nearby Clinics Found",
          description: `Found ${results.length} medical facilities nearby. Red markers show clinic locations.`
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* API Key Notice */}
      {!hasApiKey && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Google Maps is loading your API key. The interactive map and location features will be available shortly.
          </AlertDescription>
        </Alert>
      )}

      {/* Address Search */}
      <div className="space-y-2">
        <Label htmlFor="address-search">Search & Verify Address</Label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              id="address-search"
              value={searchInput}
              onChange={(e) => handleAddressSearch(e.target.value)}
              placeholder="Start typing to search for address..."
              className="pr-10"
            />
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            
            {/* Autocomplete suggestions */}
            {predictions.length > 0 && hasApiKey && (
              <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg">
                {predictions.map((prediction, index) => (
                  <button
                    key={prediction.place_id}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                    onClick={() => selectPrediction(prediction)}
                  >
                    <div className="font-medium">{prediction.structured_formatting.main_text}</div>
                    <div className="text-muted-foreground text-xs">{prediction.structured_formatting.secondary_text}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button 
            type="button"
            onClick={() => {
              // Update the address field with current input
              onAddressChange(searchInput);
              // Try to geocode if API key is available
              if (hasApiKey) {
                geocodeAddress(searchInput);
              }
            }} 
            disabled={isLoading || !searchInput.trim()}
            size="sm"
          >
            <MapPin className="h-4 w-4 mr-2" />
            {hasApiKey ? (isLoading ? 'Finding...' : 'Find') : 'Save Address'}
          </Button>
        </div>
      </div>

       {/* Quick Actions */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
         <a
           href={googleMapsUrl || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`}
           target="_blank"
           rel="noopener noreferrer"
           className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
         >
           <Navigation className="h-4 w-4 mr-2" />
           Get Directions
         </a>
         
         {!googleMapsUrl && (
           <Button
             onClick={findNearbyClinics}
             disabled={!placesService}
             variant="outline"
             size="sm"
           >
             <Building className="h-4 w-4 mr-2" />
             Find Nearby Clinics
           </Button>
         )}
         
         <a
           href={googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
           target="_blank"
           rel="noopener noreferrer"
           className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
         >
           <ExternalLink className="h-4 w-4 mr-2" />
           Open in Google Maps
         </a>
       </div>
      <Card>
        <CardHeader>
          <CardTitle>Location Map</CardTitle>
        </CardHeader>
        <CardContent>
          {hasApiKey ? (
            <div 
              ref={mapRef} 
              className="w-full h-80 rounded-lg border"
              style={{ minHeight: '320px' }}
            />
          ) : (
            <div className="w-full h-80 rounded-lg border bg-muted flex items-center justify-center">
              <div className="text-center space-y-2">
                <MapPin className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">Interactive map will appear here</p>
                <p className="text-xs text-muted-foreground">Configure Google Maps API key to enable</p>
              </div>
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground">
            <p>• Blue marker: {customerName}'s location</p>
            <p>• Red markers: Nearby medical facilities</p>
            <p>• Use search above to find and verify addresses</p>
          </div>
        </CardContent>
      </Card>

      {/* Address Management */}
      <Card>
        <CardHeader>
          <CardTitle>Address Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Current Address</Label>
            <div className="mt-1 p-2 bg-muted rounded text-sm">
              {address || "No address set"}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">For Call Agents:</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Use "Get Directions" to guide callers</li>
                <li>• Reference nearby landmarks if needed</li>
                <li>• Check "Find Nearby Clinics" for alternatives</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Address Tips:</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Include postcode for accuracy</li>
                <li>• Verify building numbers and names</li>
                <li>• Note parking availability if relevant</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}