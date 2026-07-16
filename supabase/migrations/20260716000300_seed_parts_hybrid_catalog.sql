-- Curated roadside catalog. All prices are configurable estimates; inventory is not real-time.
insert into public.part_categories(name,system_name,vehicle_type) values
('Steering Components','Steering','Tractor'),('Charging & Starting','Charging and Starting','Tractor'),('Fuel System','Fuel System','Tractor'),('Fifth Wheel','Fifth Wheel','Tractor'),('Cab & Body','Cab and Body','Tractor'),('Tires & Wheels - Tractor','Tires and Wheels','Tractor'),('Trailer ABS','ABS','53'' Dry Van Trailer'),('Trailer Roof','Roof','53'' Dry Van Trailer'),('Trailer Floor','Floor','53'' Dry Van Trailer'),('Trailer Side Panels','Side Panels','53'' Dry Van Trailer'),('Trailer Crossmembers','Crossmembers','53'' Dry Van Trailer'),('ICC Bumper','ICC Bumper','53'' Dry Van Trailer'),('Upper Coupler','Kingpin and Upper Coupler','53'' Dry Van Trailer'),('Tires & Wheels - Trailer','Tires and Wheels','53'' Dry Van Trailer') on conflict(name) do nothing;

insert into public.parts_catalog(part_name,part_number,description,category_id,vehicle_type,system_name,compatible_brands,estimated_low_price,estimated_selling_price,estimated_high_price,core_charge,unit_of_measure,availability_status,dispatcher_notes,is_active)
select x.part_name,x.part_number,x.description,c.id,x.vehicle_type,x.system_name,x.brands,x.low,x.sell,x.high,x.core,x.uom,'Call to verify','Configurable customer estimate. Verify dimensions, fitment, brand, supplier price, freight, tax, and availability.',true from (values
('Air brake nylon tubing, 3/8 in',null,'DOT air brake tubing','Tractor','Air brake system',array['Parker','Gates','Eaton'],12,24,42,0,'foot'),
('Air brake push-to-connect fitting',null,'DOT brass fitting, size must be verified','Tractor','Air brake system',array['Parker','Bendix','Eaton'],10,22,45,0,'each'),
('Type 30 brake chamber',null,'Service brake chamber','Tractor','Foundation brakes',array['Bendix','Haldex','MGM'],70,125,190,0,'each'),
('16.5 x 7 brake shoe kit',null,'Lined brake shoe set with hardware','Tractor','Foundation brakes',array['Meritor','Bendix','Marathon'],95,175,275,0,'axle set'),
('Hub wheel seal',null,'Drive or steer axle wheel seal; verify application','Tractor','Wheel End',array['Stemco','SKF','National'],35,68,110,0,'each'),
('Suspension air spring',null,'Rolling-lobe air spring; verify mounting and height','Tractor','Suspension',array['Firestone','Goodyear','ContiTech'],120,215,340,0,'each'),
('Drag link assembly',null,'Steering drag link; measure before ordering','Tractor','Steering',array['TRW','Meritor','Dorman HD'],180,325,520,0,'each'),
('Group 31 commercial battery','31-950','12V threaded-post commercial battery','Tractor','Charging and Starting',array['Interstate','East Penn','Odyssey'],145,225,340,25,'each'),
('Heavy-duty alternator',null,'12V alternator; verify amperage and mount','Tractor','Charging and Starting',array['Delco Remy','Leece-Neville','Bosch'],350,595,850,120,'each'),
('LED marker lamp, amber',null,'Sealed LED marker/clearance lamp','Tractor','Electrical',array['Truck-Lite','Grote','Optronics'],12,28,52,0,'each'),
('Upper radiator hose',null,'Molded coolant hose; verify engine and chassis','Tractor','Cooling',array['Gates','Dayco','Continental'],45,85,145,0,'each'),
('Coolant reservoir cap',null,'Pressure cap; verify pressure rating','Tractor','Cooling',array['Dorman HD','Gates','OEM'],18,36,65,0,'each'),
('Serpentine belt',null,'Engine accessory drive belt; verify routing','Tractor','Engine',array['Gates','Dayco','Continental'],55,105,180,0,'each'),
('Fuel water separator filter',null,'Spin-on fuel/water separator','Tractor','Fuel System',array['Fleetguard','Davco','Donaldson'],35,72,125,0,'each'),
('DEF dosing valve',null,'Aftertreatment dosing valve; application specific','Tractor','Aftertreatment',array['Bosch','Cummins','Detroit'],450,775,1150,75,'each'),
('U-joint kit',null,'Heavy-duty driveline universal joint','Tractor','Drivetrain',array['Spicer','Meritor','Neapco'],90,165,280,0,'each'),
('Fifth wheel release handle kit',null,'Release handle and hardware','Tractor','Fifth Wheel',array['Fontaine','SAF-Holland','Jost'],65,125,210,0,'kit'),
('Exterior door handle',null,'Cab door handle; side/application specific','Tractor','Cab and Body',array['Dorman HD','OEM'],45,95,165,0,'each'),
('22.5 x 8.25 steel wheel','22.5X8.25','10-hole hub-piloted steel wheel','Tractor','Tires and Wheels',array['Accuride','Maxion','OEM'],145,235,350,0,'each'),
('Type 30/30 spring brake chamber',null,'Combination spring brake chamber','53'' Dry Van Trailer','Air brake system',array['Bendix','Haldex','MGM'],80,145,225,0,'each'),
('16.5 x 7 trailer brake drum',null,'Outboard brake drum; verify pilot and dimensions','53'' Dry Van Trailer','Foundation brakes',array['Webb','Gunite','ConMet'],115,210,325,0,'each'),
('Trailer ABS wheel speed sensor',null,'Two-wire wheel speed sensor','53'' Dry Van Trailer','ABS',array['Bendix','WABCO','Haldex'],65,125,210,0,'each'),
('Trailer suspension air spring',null,'Rolling-lobe air spring; verify suspension model','53'' Dry Van Trailer','Suspension',array['Firestone','Goodyear','ContiTech'],110,205,325,0,'each'),
('Trailer hub cap',null,'Oil-bath hub cap; verify bolt pattern','53'' Dry Van Trailer','Wheel End',array['Stemco','Hendrickson','SKF'],45,85,145,0,'each'),
('Landing gear crank handle',null,'Replacement landing gear crank and hardware','53'' Dry Van Trailer','Landing Gear',array['SAF-Holland','Jost','KIC'],55,105,175,0,'each'),
('Rear door roller assembly',null,'Dry van door roller and bracket','53'' Dry Van Trailer','Doors',array['Whiting','TODCO','Transglobal'],25,55,95,0,'each'),
('Translucent roof patch panel',null,'Roof repair material; size cut to application','53'' Dry Van Trailer','Roof',array['Kemlite','Crane Composites','Generic'],75,145,260,0,'sheet'),
('Laminated trailer floor board',null,'Replacement hardwood floor section','53'' Dry Van Trailer','Floor',array['Havco','Rockland','Generic'],95,185,320,0,'board'),
('Aluminum side panel patch',null,'Pre-painted aluminum repair sheet','53'' Dry Van Trailer','Side Panels',array['Utility','Great Dane','Generic'],45,95,180,0,'sheet'),
('Steel trailer crossmember',null,'Replacement crossmember; verify width/profile','53'' Dry Van Trailer','Crossmembers',array['Stoughton','Wabash','Generic'],95,185,310,0,'each'),
('ICC bumper tube',null,'Rear impact guard horizontal member','53'' Dry Van Trailer','ICC Bumper',array['Great Dane','Utility','Wabash'],250,425,650,0,'each'),
('Upper coupler kingpin, 2 in','KP-200','Weld-in 2-inch trailer kingpin','53'' Dry Van Trailer','Kingpin and Upper Coupler',array['SAF-Holland','Jost','Premier'],85,155,250,0,'each'),
('LED stop/turn/tail lamp, 4 in',null,'Sealed round red LED lamp','53'' Dry Van Trailer','Electrical',array['Truck-Lite','Grote','Optronics'],18,42,75,0,'each'),
('7-way trailer receptacle','7-WAY','SAE J560 nosebox/receptacle','53'' Dry Van Trailer','Electrical',array['Phillips','Grote','Tectran'],35,75,130,0,'each'),
('22.5 x 8.25 steel trailer wheel','22.5X8.25','10-hole hub-piloted steel wheel','53'' Dry Van Trailer','Tires and Wheels',array['Accuride','Maxion','OEM'],145,235,350,0,'each')
) x(part_name,part_number,description,vehicle_type,system_name,brands,low,sell,high,core,uom)
join public.part_categories c on c.system_name=x.system_name and c.vehicle_type in (x.vehicle_type,'Both')
where not exists(select 1 from public.parts_catalog p where p.part_name=x.part_name and p.vehicle_type=x.vehicle_type);
