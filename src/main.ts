// Tool: Find Local Leads (Google Maps)
async function handleFindLocalLeads({ keyword, location, radius = 5000, max_results = 20 }: any) {
  await Actor.charge({ eventName: 'find-local-leads' });
  
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const geo = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: { address: location, key },
  });
  
  if (geo.data.status !== 'OK') throw new Error(`Geocoding failed: ${geo.data.status}`);
  const { lat, lng } = geo.data.results[0].geometry.location;

  const places = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
    params: { location: `${lat},${lng}`, radius, keyword, key },
  });

  if (places.data.status !== 'OK') throw new Error(`Places search failed: ${places.data.status}`);

  const leads = await Promise.all(
    places.data.results.slice(0, max_results).map(async (place: any) => {
      try {
        const details = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
          params: { place_id: place.place_id, fields: 'name,formatted_address,formatted_phone_number,website,rating', key },
        });
        const d = details.data.result;
        return {
          name: d.name, 
          address: d.formatted_address, 
          phone: d.formatted_phone_number,
          website: d.website, 
          rating: d.rating,
          maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
        };
      } catch (e) {
        return { name: place.name, rating: place.rating };
      }
    })
  );

  return { content: [{ type: 'text', text: JSON.stringify({ keyword, location, leads }, null, 2) }] };
}
