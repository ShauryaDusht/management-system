import datetime
from collections import defaultdict

from django.core.management.base import BaseCommand

from apps.housekeeping.models import (
    HKCaretaker,
    HKDepartment,
    HKLocation,
    HKSupervisor,
    HKTaskTemplate,
    HKWorker,
)


class Command(BaseCommand):
    help = 'Seed complete housekeeping master data, staff, and task templates'

    def __init__(self):
        super().__init__()
        self.created = defaultdict(int)
        self.worker_type_created = defaultdict(int)
        self.departments = {}
        self.locations = {}
        self.supervisors = {}
        self.caretakers = {}

    def parse_time(self, value):
        if not value:
            return None
        return datetime.datetime.strptime(value, '%H:%M').time()

    def create_department(self, key, name, dept_type):
        obj, was_created = HKDepartment.objects.get_or_create(
            name=name,
            defaults={
                'dept_type': dept_type,
                'description': '',
                'is_active': True,
            },
        )
        if not was_created and obj.dept_type != dept_type:
            obj.dept_type = dept_type
            obj.save(update_fields=['dept_type'])
        if was_created:
            self.created['departments'] += 1
        self.departments[key] = obj

    def create_location(self, dept_key, name, code='', floor=''):
        department = self.departments[dept_key]
        obj, was_created = HKLocation.objects.get_or_create(
            department=department,
            name=name,
            defaults={
                'code': code,
                'floor_or_area': floor,
                'is_active': True,
            },
        )
        if was_created:
            self.created['locations'] += 1
        self.locations[name] = obj

    def create_supervisor(self, name, areas_managed, dept_keys):
        obj, was_created = HKSupervisor.objects.get_or_create(
            name=name,
            defaults={
                'phone': '',
                'areas_managed': areas_managed,
                'is_active': True,
            },
        )
        if was_created:
            self.created['supervisors'] += 1
        obj.areas_managed = areas_managed
        obj.is_active = True
        obj.save(update_fields=['areas_managed', 'is_active'])
        obj.departments.set([self.departments[key] for key in dept_keys])
        self.supervisors[name] = obj

    def create_caretaker(self, name, phone, location_names, supervisor_name=None):
        obj, was_created = HKCaretaker.objects.get_or_create(
            name=name,
            defaults={
                'phone': phone,
                'is_active': True,
            },
        )
        if was_created:
            self.created['caretakers'] += 1
        obj.phone = phone
        obj.is_active = True
        if supervisor_name and supervisor_name in self.supervisors:
            obj.supervisor = self.supervisors[supervisor_name]
            obj.save(update_fields=['phone', 'is_active', 'supervisor'])
        else:
            obj.save(update_fields=['phone', 'is_active'])
        obj.locations.set([self.locations[name] for name in location_names if name in self.locations])
        self.caretakers[name] = obj

    def create_worker(
        self,
        name,
        phone='',
        punching_no='',
        worker_type='hk_staff',
        shift='day',
        department_key=None,
        location_name=None,
        caretaker_name=None,
        supervisor_name=None,
        is_reliever=False,
    ):
        location = self.locations.get(location_name) if location_name else None
        department = self.departments.get(department_key) if department_key else None
        if not department and location:
            department = location.department
        caretaker = self.caretakers.get(caretaker_name) if caretaker_name else None
        supervisor = self.supervisors.get(supervisor_name) if supervisor_name else None

        lookup = {'name': name, 'worker_type': worker_type, 'phone': phone}
        defaults = {
            'punching_no': punching_no,
            'shift': shift,
            'department': department,
            'location': location,
            'caretaker': caretaker,
            'supervisor': supervisor,
            'is_active': True,
            'is_reliever': is_reliever,
        }

        obj, was_created = HKWorker.objects.get_or_create(**lookup, defaults=defaults)
        if not was_created:
            obj.punching_no = punching_no
            obj.shift = shift
            obj.department = department
            obj.location = location
            obj.caretaker = caretaker
            obj.supervisor = supervisor
            obj.is_active = True
            obj.is_reliever = is_reliever
            obj.save(
                update_fields=[
                    'punching_no',
                    'shift',
                    'department',
                    'location',
                    'caretaker',
                    'supervisor',
                    'is_active',
                    'is_reliever',
                ]
            )

        if was_created:
            self.created['workers'] += 1
            self.worker_type_created[worker_type] += 1

    def create_task_template(
        self,
        dept_key,
        location_name,
        order,
        start_time,
        end_time,
        name,
        area='',
        frequency='daily',
        worker_type='',
        shift='',
    ):
        department = self.departments[dept_key]
        location = self.locations.get(location_name) if location_name else None
        start = self.parse_time(start_time) if start_time else None
        end = self.parse_time(end_time) if end_time else None

        _, was_created = HKTaskTemplate.objects.get_or_create(
            department=department,
            location=location,
            name=name,
            start_time=start,
            end_time=end,
            order=order,
            defaults={
                'description': name,
                'area': area,
                'frequency': frequency,
                'worker_type': worker_type,
                'shift': shift,
                'is_active': True,
            },
        )
        if was_created:
            self.created['task_templates'] += 1

    def seed_departments_and_locations(self):
        self.create_department('hostel', 'Hostel', 'hostel')
        self.create_department('gh_new', 'Guest House - New', 'guesthouse')
        self.create_department('gh_old', 'Guest House - Old RB', 'guesthouse')
        self.create_department('sports', 'Sports Complex', 'sports')
        self.create_department('central_arcade', 'Central Arcade', 'central_arcade')
        self.create_department('research_park', 'Research Park', 'research_park')
        self.create_department('roads', 'Roads & Outdoor', 'roads')
        self.create_department('swm', 'Solid Waste Management', 'swm')
        self.create_department('academic', 'Academic Blocks', 'academic')
        self.create_department('director_bungalow', 'Director Bungalow', 'director_bungalow')
        self.create_department('jrha', 'JRHA - Palaj', 'jrha')

        hostel_locations = [
            'Aibaan Hostel', 'Beuaki Hostel', 'Chimair Hostel', 'Duven Hostel',
            'Emiet Hostel', 'Firpeal Hostel', 'Griwiksh Hostel', 'Hiqom Hostel',
            'Ijokha Hostel', 'Jurqi Hostel', 'Kyzeel Hostel', 'Lekhaag Hostel',
        ]
        for location_name in hostel_locations:
            self.create_location('hostel', location_name)

        for location_name in ['Ground Floor Indoor', 'First Floor Indoor', 'Swimming & Volleyball Area', 'Outside Area']:
            self.create_location('sports', location_name)

        for location_name in ['Ground Floor', 'First Floor', 'Second Floor']:
            self.create_location('central_arcade', location_name)

        for location_name in ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor', 'Outside Area']:
            self.create_location('research_park', location_name)

        for location_name in [
            'Gate-1 to Research Park (Road E-1,K)',
            'Gate-3 to Parking (Road F-2)',
            'U-You SAP Circle Area (Road C1,C2)',
            'Director Residence to Sports (Road A-1,J-1)',
            'Academic Block-2 Road (Road B-1)',
            'Gate-5 to Hostel Area (Road C-2)',
            'Laundry to Gate-2 (Road M-1,F-19)',
        ]:
            self.create_location('roads', location_name)

        for location_name in [
            'Housing Collection Area',
            'Hostel Collection Area',
            'Academic Collection Area',
            'Segregation Point',
        ]:
            self.create_location('swm', location_name)

        for location_name in ['Block-1 Office', 'Block-1&2 Staircase', 'Rooms (201-302)', 'Gate-3']:
            self.create_location('gh_old', location_name)

        for idx in range(1, 14):
            self.create_location('academic', f'AB-{idx}')

        self.create_location('director_bungalow', 'Director Bungalow')
        self.create_location('jrha', 'JRHA - Palaj')

    def seed_supervisors_caretakers_workers(self):
        supervisors = [
            ('Ashok Rathod', 'Guest House & Director Bungalow', ['gh_new', 'gh_old', 'director_bungalow']),
            ('Kaushik Parmar', 'AB-12, AB-13 New Academy', ['academic']),
            ('Shailesh Prajapati', 'AB-10, AB-11 New AB U-Shape', ['academic']),
            ('Maulik Patel', 'Research Park', ['research_park']),
            ('Bharat Solanki', 'Sports Complex & Central Arcade', ['sports', 'central_arcade']),
            ('Mukesh Vaghela', 'AB-1, AB-2, AB-5, AB-6, AB-8', ['academic']),
            ('Bipin Vaghela', 'AB-3, AB-4, AB-7, AB-9 & Common Area', ['academic']),
            ('Narendra Shreemali', 'Old Guest House RB-14, 16 & Roads', ['roads', 'gh_old']),
            ('Pradip', 'Solid Waste Management', ['swm']),
        ]
        for name, areas, dept_keys in supervisors:
            self.create_supervisor(name, areas, dept_keys)

        caretakers = [
            ('Priyanka', '6353228604', ['Aibaan Hostel']),
            ('Anita', '9512389739', ['Beuaki Hostel', 'Chimair Hostel']),
            ('Rushita', '7083740424', ['Ijokha Hostel']),
            ('Pankaj', '9904883975', ['Duven Hostel', 'Emiet Hostel']),
            ('Anil', '8155037413', ['Firpeal Hostel', 'Griwiksh Hostel']),
            ('Nikul', '8238759843', ['Hiqom Hostel']),
        ]
        for name, phone, locations in caretakers:
            self.create_caretaker(name, phone, locations)

        hostel_workers = [
            ('Reeta Ben', '9574379477', '357', 'Aibaan Hostel', 'Priyanka'),
            ('Meena Ben', '9909679865', '76', 'Aibaan Hostel', 'Priyanka'),
            ('Kailash B', '7265921026', '143', 'Aibaan Hostel', 'Priyanka'),
            ('Shilpa Ben', '6356046585', '419', 'Beuaki Hostel', 'Anita'),
            ('Bhanu Ben', '7567371788', '332', 'Beuaki Hostel', 'Anita'),
            ('Surya Ben', '9725963299', '233', 'Beuaki Hostel', 'Anita'),
            ('Kailashben M', '8490053837', '98', 'Chimair Hostel', 'Anita'),
            ('Geeta Ben', '7041016942', '230', 'Chimair Hostel', 'Anita'),
            ('Manisha Ben', '9157691322', '356', 'Chimair Hostel', 'Anita'),
            ('Sangeeta Ben', '8866941201', '219', 'Ijokha Hostel', 'Rushita'),
            ('Sonal Ben', '7359834672', '415', 'Ijokha Hostel', 'Rushita'),
            ('Champa Ben', '8140558882', '249', 'Ijokha Hostel', 'Rushita'),
            ('Shailesh Rathod', '9081107066', '239', 'Duven Hostel', 'Pankaj'),
            ('Rajnikant', '6355825476', '153', 'Duven Hostel', 'Pankaj'),
            ('Harish', '7698462575', '122', 'Duven Hostel', 'Pankaj'),
            ('Nikul Solanki', '8238759843', '446', 'Emiet Hostel', 'Pankaj'),
            ('Jagdish', '9662312505', '157', 'Emiet Hostel', 'Pankaj'),
            ('Mahendra Makwana', '7041143190', '148', 'Emiet Hostel', 'Pankaj'),
            ('Anand', '9023393753', '310', 'Firpeal Hostel', 'Anil'),
            ('Satish', '9558903676', '113', 'Firpeal Hostel', 'Anil'),
            ('Jaydeep Solanki', '9727981188', '259', 'Firpeal Hostel', 'Anil'),
            ('Karan', '7016522113', '260', 'Griwiksh Hostel', 'Anil'),
            ('Jignesh', '8401617156', '115', 'Griwiksh Hostel', 'Anil'),
            ('Sailesh Vaghela', '8734987012', '109', 'Griwiksh Hostel', 'Anil'),
        ]
        for name, phone, punching_no, location_name, caretaker_name in hostel_workers:
            self.create_worker(
                name=name,
                phone=phone,
                punching_no=punching_no,
                worker_type='hk_staff',
                shift='day',
                location_name=location_name,
                caretaker_name=caretaker_name,
                department_key='hostel',
            )

        relievers = [
            ('Deepika Ben', '7383512108', '418'),
            ('Mital Ben', '7383619204', '386'),
            ('Vinay', '8758388061', '136'),
            ('Lala', '9726303104', '154'),
            ('Hasmukhbhai', '9714466201', '75'),
        ]
        for name, phone, punching_no in relievers:
            self.create_worker(
                name=name,
                phone=phone,
                punching_no=punching_no,
                worker_type='reliever',
                is_reliever=True,
                department_key='hostel',
            )

        road_workers = [
            ('Ashokbhai Thakor', '9054841766'),
            ('Rohit Thakor', '8320831295'),
            ('Chirag Thakor', '7041456600'),
            ('Kanji Thakor', '8337415371'),
            ('Mahesh Raval', '7698588092'),
            ('Prakam Thakor', '6355540093'),
        ]
        for name, phone in road_workers:
            self.create_worker(
                name=name,
                phone=phone,
                worker_type='road',
                department_key='roads',
                supervisor_name='Narendra Shreemali',
            )

        swm_workers = [
            ('Saleshbhai Thakur', '9723045094'),
            ('Satishbhai Raval', '9157865695'),
            ('Jitendra Thakur', '8780211472'),
            ('Naveenbhai Chauhan', '9737949563'),
            ('Rajnibhai Parmar', '8758216753'),
            ('Dineshbhai Purohya', '6351446589'),
            ('Baldevbhai Vagela', '9558464772'),
            ('Saleshbhai Vagela', '6351150573'),
            ('Kantibhai Thakur', '9924375528'),
        ]
        for name, phone in swm_workers:
            self.create_worker(
                name=name,
                phone=phone,
                worker_type='swm',
                department_key='swm',
                supervisor_name='Pradip',
            )

        biogas_workers = [
            ('Saleshbhai Solanki', '9157042493'),
            ('Sameerbhai Thakur', '6352780086'),
        ]
        for name, phone in biogas_workers:
            self.create_worker(name=name, phone=phone, worker_type='biogas', department_key='swm')

        old_guest_workers = [
            ('Stish Vaghela', '9560702819'),
            ('Mukesh Parmar', '7096432339'),
            ('Rajem Chauhan', '9576629886'),
        ]
        for name, phone in old_guest_workers:
            self.create_worker(
                name=name,
                phone=phone,
                worker_type='guesthouse',
                department_key='gh_old',
                supervisor_name='Narendra Shreemali',
            )

        sports_workers = [
            ('Anitaben', 'day', 'Ground Floor Indoor'),
            ('Rameshbhai', 'day', 'Ground Floor Indoor'),
            ('Uttambhai', 'day', 'First Floor Indoor'),
            ('Rudhreshben', 'day', 'First Floor Indoor'),
            ('Sohilbhai', 'evening', 'Swimming & Volleyball Area'),
            ('Rahulbhai', 'evening', 'Swimming & Volleyball Area'),
            ('Rajendrabhai', 'night', 'Outside Area'),
            ('Akshaybhai', 'night', 'Outside Area'),
        ]
        for name, shift, location_name in sports_workers:
            self.create_worker(
                name=name,
                worker_type='sports',
                shift=shift,
                department_key='sports',
                location_name=location_name,
                supervisor_name='Bharat Solanki',
            )
        self.create_worker(
            name='Jaydeep Vaghela',
            worker_type='reliever',
            is_reliever=True,
            department_key='sports',
            supervisor_name='Bharat Solanki',
        )

        central_workers = [
            ('Vijay', 'Ground Floor'),
            ('Bhavna Ben', 'First Floor'),
            ('Ramesh Bhai', 'Second Floor'),
        ]
        for name, floor_location in central_workers:
            self.create_worker(
                name=name,
                worker_type='other',
                department_key='central_arcade',
                location_name=floor_location,
                supervisor_name='Bharat Solanki',
            )

    def seed_task_templates(self):
        hostel_locations = [
            'Aibaan Hostel', 'Beuaki Hostel', 'Chimair Hostel', 'Duven Hostel',
            'Emiet Hostel', 'Firpeal Hostel', 'Griwiksh Hostel', 'Hiqom Hostel',
            'Ijokha Hostel', 'Jurqi Hostel', 'Kyzeel Hostel', 'Lekhaag Hostel',
        ]

        hostel_tasks = [
            (1, '08:10', '08:45', 'Washroom Touch Up (Floor 2)', 'Washroom'),
            (2, '08:45', '09:00', 'Staircase Cleaning', 'Staircase'),
            (3, '09:00', '09:30', 'Room Cleaning (5 Rooms)', 'Rooms'),
            (4, '09:30', '09:45', 'Tea Break', 'Break'),
            (5, '09:45', '10:00', 'Outside Round', 'Outside'),
            (6, '10:00', '12:00', 'Room Round (15 Rooms)', 'Rooms'),
            (7, '12:00', '13:00', 'Pantry Cleaning', 'Pantry'),
            (8, '13:00', '13:45', 'Lunch Break', 'Break'),
            (9, '13:45', '14:00', 'Paper Cutting / Admin Work', 'Admin'),
            (10, '14:00', '16:00', 'Room & Extra Work (10 Rooms)', 'Rooms'),
            (11, '16:00', '16:50', 'Common Cleaning & Pantry Round', 'Common Area'),
            (12, '17:00', None, 'Day Complete - Home', 'End'),
        ]
        floor_tasks = [
            (1, '08:10', '08:45', '3rd Floor Washroom Touch Up', 'Washroom'),
            (2, '08:45', '09:30', 'Ground Floor Dry Mop', 'Ground Floor'),
            (3, '09:30', '09:45', 'Tea Break + Inside Round', 'Break'),
            (4, '09:45', '10:00', 'Outside Round', 'Outside'),
            (5, '10:00', '11:30', 'Common Room Cleaning + Staircase + Ground Floor', 'Common Area'),
            (6, '11:30', '13:00', '3rd Floor Cleaning', '3rd Floor'),
            (7, '13:00', '13:45', 'Lunch Break', 'Break'),
            (8, '13:45', '14:00', 'Paper Cutting', 'Admin'),
            (9, '14:00', '15:00', '2nd Floor Cleaning', '2nd Floor'),
            (10, '15:00', '16:30', '1st Floor Cleaning', '1st Floor'),
            (11, '16:20', '16:50', 'Ground Floor Final Cleaning', 'Ground Floor'),
            (12, '17:00', None, 'Day Complete - Home', 'End'),
        ]
        washroom_tasks = [
            (1, '08:10', '08:45', '1st Floor Washroom Touch Up', 'Washroom'),
            (2, '08:45', '09:30', 'Ground Floor Washroom Touch Up', 'Washroom'),
            (3, '09:30', '09:45', 'Tea Break', 'Break'),
            (4, '09:45', '10:00', 'Staircase Cleaning', 'Staircase'),
            (5, '10:00', '12:00', '3rd Floor Washroom Cleaning (2 rooms)', 'Washroom'),
            (6, '12:00', '13:00', '2nd Floor Washroom Cleaning (2 rooms)', 'Washroom'),
            (7, '13:00', '13:45', 'Lunch Break', 'Break'),
            (8, '13:45', '14:00', 'Paper Cutting', 'Admin'),
            (9, '14:00', '15:00', '6 Washroom Rounds Touch Up', 'Washroom'),
            (10, '15:00', '16:00', '1st Floor Washroom Full Cleaning', 'Washroom'),
            (11, '16:00', '16:50', 'All Washroom Final Touch Up', 'Washroom'),
            (12, '17:00', None, 'Day Complete - Home', 'End'),
        ]

        for location_name in hostel_locations:
            for order, start, end, title, area in hostel_tasks:
                self.create_task_template('hostel', location_name, order, start, end, title, area, 'daily', 'hk_staff', 'day')
            for order, start, end, title, area in floor_tasks:
                self.create_task_template('hostel', location_name, 100 + order, start, end, title, area, 'daily', 'hk_staff', 'day')
            for order, start, end, title, area in washroom_tasks:
                self.create_task_template('hostel', location_name, 200 + order, start, end, title, area, 'daily', 'hk_staff', 'day')

        swm_tasks = [
            (1, '08:00', '08:15', 'Attendance + Tools Collection + Vehicle Check'),
            (2, '08:15', '09:15', 'Housing Collection (Door-to-door wet+dry)'),
            (3, '08:15', '09:15', 'Hostel Waste Collection (Hostel buildings)'),
            (4, '08:15', '09:15', 'Vehicle Collection (Mess/Canteen/Academic)'),
            (5, '09:15', '09:45', 'Break + Equipment Check'),
            (6, '09:45', '10:15', 'Waste Unloading + Segregation (wet/dry/plastic/paper)'),
            (7, '10:15', '11:30', 'Secondary Collection (Remaining campus bins)'),
            (8, '11:30', '13:00', 'Waste Transfer to Segregation Area'),
            (9, '13:00', '14:00', 'Lunch Break'),
            (10, '14:00', '15:30', 'Academic Block Collection'),
            (11, '15:30', '16:30', 'Final Waste Clearance + Clean Storage'),
            (12, '16:30', '17:00', 'Equipment Clean + Park Vehicle + Submit Report'),
        ]
        for order, start, end, title in swm_tasks:
            self.create_task_template('swm', None, order, start, end, title, 'SWM', 'daily', 'swm', 'day')

        road_tasks = [
            (1, '08:00', '09:30', 'Morning Road Sweep - Assigned Area'),
            (2, '09:30', '11:30', 'Main Area Cleaning + Footpath'),
            (3, '11:30', '13:00', 'U-Shape/Circle Area Cleaning'),
            (4, '13:00', '14:00', 'Lunch Break'),
            (5, '14:00', '15:30', 'Afternoon Road Round'),
            (6, '15:30', '17:00', 'Sanitize + Final Sweep + Garbage Collection'),
        ]
        for order, start, end, title in road_tasks:
            self.create_task_template('roads', None, order, start, end, title, 'Roads', 'daily', 'road', 'day')

        sports_day_a = [
            (1, '08:00', '09:00', 'Ladies Toilet + Office + Yoga Hall'),
            (2, '09:00', '10:00', 'GYM + Table Tennis Hall'),
            (3, '10:00', '10:15', 'Tea Break'),
            (4, '10:15', '11:30', 'Squash Court + Swimming Pool Area'),
            (5, '11:30', '13:00', 'Ladies Toilet Deep Clean + Extra Work'),
            (6, '13:00', '14:00', 'Lunch Break'),
            (7, '14:00', '15:30', 'Washroom Deep Clean + Glass + Fans'),
            (8, '15:30', '17:00', 'GYM Yoga Squash TT Special Clean'),
        ]
        for order, start, end, title in sports_day_a:
            self.create_task_template('sports', 'Ground Floor Indoor', order, start, end, title, 'Sports', 'daily', 'sports', 'day')

        sports_day_b = [
            (1, '08:00', '08:30', 'Main Entry + Corridor + Open Gym Floor'),
            (2, '08:30', '10:00', 'Gallery Mopping + Gents Toilet'),
            (3, '10:00', '10:15', 'Tea Break'),
            (4, '10:15', '12:00', 'Glass Cleaning + GYM Yoga Squash TT'),
            (5, '12:00', '13:00', 'Specially Abled Washroom + Trophy + Glass'),
            (6, '13:00', '14:00', 'Lunch Break'),
            (7, '14:00', '16:00', 'Main Entry + Floor Cleaning'),
            (8, '16:00', '17:00', 'Floor + Both Terraces'),
        ]
        for order, start, end, title in sports_day_b:
            self.create_task_template('sports', 'First Floor Indoor', 50 + order, start, end, title, 'Sports', 'daily', 'sports', 'day')

        sports_evening = [
            (1, '14:00', '15:00', 'Badminton Hall 1&2 Floor Mopping'),
            (2, '15:00', '16:30', 'Basketball Hall Cleaning'),
            (3, '16:30', '17:00', 'Ladies + Gents Toilet'),
            (4, '17:00', '17:30', 'Volleyball + Swimming Pool + Gents Toilet'),
            (5, '17:30', '19:00', 'Corridor + Open Gym Area'),
            (6, '19:00', '20:00', 'Dinner Break'),
            (7, '20:00', '21:00', 'Washroom Touchup Ground + First Floor'),
            (8, '21:00', '22:00', 'Swimming Pool Washroom + Yoga'),
            (9, '22:00', '23:00', 'Basketball Dry Mop + GYM Dry Mop + Lock Up'),
        ]
        for order, start, end, title in sports_evening:
            self.create_task_template('sports', 'Swimming & Volleyball Area', 100 + order, start, end, title, 'Sports', 'daily', 'sports', 'evening')

        sports_night = [
            (1, '22:00', '23:30', 'GYM Corridor to Neem Area + Outside Gallery'),
            (2, '23:30', '01:00', 'MS Jali to Pavilion Area'),
            (3, '01:00', '02:00', 'Break'),
            (4, '02:00', '03:30', 'Lawn Tennis 4 Courts'),
            (5, '03:30', '05:00', 'Hostel Basketball 2 Courts'),
            (6, '05:00', '05:30', 'Sports Complex Backside Parking'),
            (7, '05:30', '07:00', 'Pavilion + Outside + Rolling Gate'),
        ]
        for order, start, end, title in sports_night:
            self.create_task_template('sports', 'Outside Area', 150 + order, start, end, title, 'Sports', 'daily', 'sports', 'night')

        central_ground = [
            (1, '08:00', '10:00', 'Out Area Cleaning'),
            (2, '10:00', '11:00', 'Fire Area Cleaning'),
            (3, '11:00', '13:00', 'Ground Floor Washroom (1 & G)'),
            (4, '13:00', '14:00', 'Lunch Break'),
            (5, '14:00', '15:00', 'Staircase Cleaning'),
            (6, '15:00', '16:00', 'Recruitment Area Cleaning'),
            (7, '16:00', '17:00', 'Extra Work'),
        ]
        for order, start, end, title in central_ground:
            self.create_task_template('central_arcade', 'Ground Floor', order, start, end, title, 'Ground Floor', 'daily', 'other', 'day')

        central_first = [
            (1, '08:00', '10:00', '1st Floor Cleaning'),
            (2, '10:00', '11:00', 'Washroom + Simulation Room'),
            (3, '11:00', '13:00', 'All Washrooms Cleaning'),
            (4, '13:00', '14:00', 'Lunch Break'),
            (5, '14:00', '16:00', 'Hall Cleaning'),
            (6, '16:00', '17:00', 'Railing Cleaning'),
        ]
        for order, start, end, title in central_first:
            self.create_task_template('central_arcade', 'First Floor', 40 + order, start, end, title, 'First Floor', 'daily', 'other', 'day')

        central_second = [
            (1, '08:00', '10:30', '2nd Floor + Corridor Cleaning'),
            (2, '10:30', '11:30', 'Washroom Cleaning'),
            (3, '11:30', '13:00', 'Multipurpose Room Cleaning'),
            (4, '13:00', '14:00', 'Lunch Break'),
            (5, '14:00', '15:00', 'Staircase Cleaning'),
            (6, '15:00', '17:00', 'Hall Cleaning'),
        ]
        for order, start, end, title in central_second:
            self.create_task_template('central_arcade', 'Second Floor', 80 + order, start, end, title, 'Second Floor', 'daily', 'other', 'day')

        research_tasks = [
            (1, '08:00', '09:00', 'Common Area Sweep + Entry Gate + Dustbin + Washroom 1st Round + Staircase'),
            (2, '09:00', '10:00', 'Office Dusting (Tables/Chairs/Cabins) + Floor Sweep'),
            (3, '10:00', '11:00', 'Floor Mopping + Meeting Room + Glass Spot Clean'),
            (4, '10:00', '10:15', 'Tea Break'),
            (5, '11:00', '12:00', 'Washroom Full Clean + Soap/Tissue Refill + Mirror + Water Cooler'),
            (6, '12:00', '13:00', 'Floor Dusting + Common Area'),
            (7, '13:00', '13:30', 'Lunch Break'),
            (8, '13:30', '15:00', 'Washroom Touch-Up + Common Area Check + Staircase Outside + Lift'),
            (9, '15:00', '16:30', 'Floor Corners + Lift Buttons + Dustbin + Fountain Area'),
            (10, '16:30', '17:00', 'Final Washroom + Common Area Check + Waste Disposal'),
        ]
        for order, start, end, title in research_tasks:
            self.create_task_template('research_park', None, order, start, end, title, 'Research Park', 'daily', 'hk_staff', 'day')

        old_gh_tasks = [
            (1, '08:00', '08:20', 'Block-1 Office Cleaning'),
            (2, '08:25', '09:00', 'Block-1 & 2 Staircase Cleaning'),
            (3, '09:15', '10:00', 'Room 203 Cleaning'),
            (4, '10:15', '11:00', 'Room 202 Cleaning'),
            (5, '11:15', '12:00', 'Room 201 Cleaning'),
            (6, '12:15', '13:00', 'Room 202 (2nd) Cleaning'),
            (7, '13:00', '14:00', 'Lunch Break'),
            (8, '14:00', '14:45', 'Room 302 Cleaning'),
            (9, '15:00', '15:45', 'Gate-3 Area Cleaning'),
            (10, '16:00', '16:45', 'Room 301 Cleaning'),
        ]
        for order, start, end, title in old_gh_tasks:
            self.create_task_template('gh_old', None, order, start, end, title, 'Guest House', 'daily', 'guesthouse', 'day')

    def handle(self, *args, **kwargs):
        self.seed_departments_and_locations()
        self.seed_supervisors_caretakers_workers()
        self.seed_task_templates()

        total_workers_by_type = dict(
            HKWorker.objects.values_list('worker_type').order_by('worker_type').annotate_count()
        ) if False else {}

        # Use explicit aggregation for stable output across DB backends
        type_totals = defaultdict(int)
        for worker_type, in HKWorker.objects.values_list('worker_type'):
            type_totals[worker_type] += 1

        self.stdout.write(self.style.SUCCESS('\nHousekeeping seed complete!'))
        self.stdout.write(f"Departments created: {self.created['departments']}")
        self.stdout.write(f"Locations created: {self.created['locations']}")
        self.stdout.write(f"Supervisors created: {self.created['supervisors']}")
        self.stdout.write(f"Caretakers created: {self.created['caretakers']}")
        self.stdout.write(f"Workers created: {self.created['workers']}")
        self.stdout.write(f"Task Templates created: {self.created['task_templates']}")

        self.stdout.write('\nWorker breakdown (created in this run):')
        for worker_type in sorted(self.worker_type_created.keys()):
            self.stdout.write(f"  - {worker_type}: {self.worker_type_created[worker_type]}")

        self.stdout.write('\nWorker breakdown (total in database):')
        for worker_type in sorted(type_totals.keys()):
            self.stdout.write(f"  - {worker_type}: {type_totals[worker_type]}")
