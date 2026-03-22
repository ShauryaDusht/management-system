import datetime

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Count

from apps.housekeeping.models import HKArea, HKScheduleTemplate, HKUserArea, HKWorker


def _normalize(value):
    return "".join((value or "").lower().split())


WORKDAY_START_MINUTES = 8 * 60
WORKDAY_TOTAL_MINUTES = 9 * 60
WORKDAY_END_MINUTES = WORKDAY_START_MINUTES + WORKDAY_TOTAL_MINUTES


def _minutes_to_time(total_minutes):
    total_minutes = max(0, min((24 * 60) - 1, int(total_minutes)))
    hours, minutes = divmod(total_minutes, 60)
    return datetime.time(hour=hours, minute=minutes)


class Command(BaseCommand):
    help = (
        "Sync the real worker roster for Guest House New, Director Bungalow, "
        "Central Arcade, Sports Complex, Research Park, Solid Waste Management, hostel areas, "
        "hostel common area, the hostel reliever pool, and "
        "academic blocks/common-area staffing, "
        "including phones, pay codes, reliever flags, and schedule labels."
    )

    TARGET_ROSTER = [
        {
            "area": "Guest House New",
            "name": "Raju Manabhai Makwana",
            "phone": "9601550905",
            "pay_code": "263",
            "worker_type": "floor",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Pankaj Parmar",
                "Parmar Rakeshkumar Ishvarbhai",
                "Raju Manabhai Makwana",
                "Makvana Rajubhai Manabhai",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Hiteshkumar Gafulbhai Vaghela",
            "phone": "9265621047",
            "pay_code": "291",
            "worker_type": "washroom",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Hitesh Vaghela",
                "Hitesh Kumar Vaghela",
                "Hiteshkumar Gafulbhai Vaghela",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Dhaval Kantibhai Jadeja",
            "phone": "9099716206",
            "pay_code": "248",
            "worker_type": "room",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Dhaval Jadeja",
                "Jadeja Dhavalkumar Kantibhai",
                "Dhaval Kantibhai Jadeja",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Ajay Harshadbhai Purabiya",
            "phone": "9099483423",
            "pay_code": "284",
            "worker_type": "room",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Ajay Purabiya",
                "Purbiya Ajay Harshadbhai",
                "Ajay Harshadbhai Purabiya",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Sumit Rameshbhai Solanki",
            "phone": "8866060385",
            "pay_code": "451",
            "worker_type": "room",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Sumit Solanki",
                "Sumit Rameshbhai Solanki",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Shailesh Ishvarbhai Raval",
            "phone": "9157891835",
            "pay_code": "306",
            "worker_type": "washroom",
            "shift": "evening",
            "is_reliever": False,
            "legacy_names": [
                "Shailesh Ravel",
                "Raval Shaileshkumar Ishvarbhai",
                "Shailesh Ishvarbhai Raval",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Sanjay Babubhai Vaghela",
            "phone": "8490012338",
            "pay_code": "304",
            "worker_type": "washroom",
            "shift": "evening",
            "is_reliever": False,
            "legacy_names": [
                "Sanjay Vaghela",
                "Vaghela Sanjaykumar Babubhai",
                "Sanjay Babubhai Vaghela",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Anil Bhupatsinh Thakor",
            "phone": "7359449665",
            "pay_code": "269",
            "worker_type": "general",
            "shift": "night",
            "is_reliever": False,
            "legacy_names": [
                "Anil Thakor",
                "Anilkumar Bhupatji Thakor",
                "Anil Bhupatsinh Thakor",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Gautam Parmar",
            "phone": "8511406220",
            "pay_code": "403",
            "worker_type": "floor",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Gautam Parmar",
                "Paramar Gautamkumar",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Pankaj Kantibhai Chamar",
            "phone": "7990281462",
            "pay_code": "393",
            "worker_type": "general",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Raju Chamar",
                "Pankajkumar Kantibhai Chamar",
                "Pankaj Kantibhai Chamar",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Lalit Babubhai Parmar",
            "phone": "8866011232",
            "pay_code": "319",
            "worker_type": "general",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Lalit Parmar",
                "Lalitbhai Parmar",
                "Lalit Babubhai Parmar",
                "Solanki Lalit",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Vishal Vaghela Karshanbhai",
            "phone": "8154945437",
            "pay_code": "320",
            "worker_type": "room",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Vishal Vaghela Karshanbhai",
                "Vishal Vaghela",
                "Vishal",
            ],
        },
        {
            "area": "Director Bungalow",
            "name": "Shailesh Ugarabhai Vaghela",
            "phone": "8128880335",
            "pay_code": "311",
            "worker_type": "general",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Shailesh Vaghela",
                "Vaghela Shaileshbhai",
                "Shailesh Ugarabhai Vaghela",
            ],
        },
        {
            "area": "Director Bungalow",
            "name": "Rakesh Ishvarbhai Parmar",
            "phone": "8238931261",
            "pay_code": "305",
            "worker_type": "general",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Rakesh Parmar",
                "Parmar Bhadreshkumar Natvarlal",
                "Rakesh Ishvarbhai Parmar",
                "Parmar Rakeshkumar Ishvarbhai",
            ],
        },
    ]

    BHARAT_SUPERVISOR_BY_AREA = {
        "Central Arcade": "bharat.solanki",
        "Sports Complex": "bharat.solanki",
    }

    BHARAT_TARGET_ROSTER = [
        {"area": "Central Arcade", "name": "Chirag Vaghela", "phone": "", "pay_code": "303", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Chirag Vaghela"]},
        {"area": "Central Arcade", "name": "Sunil Vaghela", "phone": "", "pay_code": "455", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Sunil Vaghela"]},
        {"area": "Central Arcade", "name": "Vijay Parmar", "phone": "", "pay_code": "329", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Vijay Parmar", "Parmar Vijaykumar"]},
        {"area": "Central Arcade", "name": "Ramesh Parmar", "phone": "", "pay_code": "429", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Ramesh Parmar", "Rameshbhai Ambalal Parmar"]},
        {"area": "Central Arcade", "name": "Nikhil Makvana", "phone": "", "pay_code": "364", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Nikhil", "Nikhil Makvana", "Nikhil makvana"]},
        {"area": "Central Arcade", "name": "Bhavna Ben Chavda", "phone": "", "pay_code": "218", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Bhavnaben", "Bhavna ben chavda", "Chavada Bhavanaben Kishorbhai"]},
        {"area": "Central Arcade", "name": "Sikandar Bhangi", "phone": "", "pay_code": "389", "worker_type": "general", "shift": "day", "is_reliever": False, "legacy_names": ["Sikandar bhangi", "Sikandarbhai Dungarbhai Bhangi"]},
        {"area": "Sports Complex", "name": "Shohil J Vaghela", "phone": "", "pay_code": "257", "worker_type": "washroom", "shift": "evening", "is_reliever": False, "legacy_names": ["Sohil Vaghela", "Shohil Vaghela", "Shohil.J.vaghela", "Sohilkumar Vaghela"]},
        {"area": "Sports Complex", "name": "Ramesh N Parmar", "phone": "", "pay_code": "411", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Ramesh Sports", "Ramesh.N.parmar", "Rameshbhai Narsinhbhai Parmar"]},
        {"area": "Sports Complex", "name": "Jaydeep D Vaghela", "phone": "", "pay_code": "447", "worker_type": "general", "shift": "day", "is_reliever": False, "legacy_names": ["Jaydeep Vaghela", "Jaydeep.D.vaghela", "Jaydip Dineshbhai Vaghela"]},
        {"area": "Sports Complex", "name": "Rahul J Vaghela", "phone": "", "pay_code": "337", "worker_type": "washroom", "shift": "evening", "is_reliever": False, "legacy_names": ["Rahul Vaghela", "Rahul.J.vgahela", "Rahul.J.vaghela", "Vaghela Rahulkumar Jasubhai"]},
        {"area": "Sports Complex", "name": "Akshay R Parmar", "phone": "", "pay_code": "414", "worker_type": "floor", "shift": "evening", "is_reliever": False, "legacy_names": ["Akshay Parmar", "Akshay.R.parmar", "Axaykumar Rameshbhai Parmar"]},
        {"area": "Sports Complex", "name": "Rudhreshben S Solanki", "phone": "", "pay_code": "282", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Retuben Solanki", "Rudhreshben.S. solanki", "Rudhreshben S Solanki", "Rudreshaben Sandipkumar Solanki"]},
        {"area": "Sports Complex", "name": "Anitaben", "phone": "", "pay_code": "385", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Anita Solanki", "Anitaben", "Solanki Anitaben Rameshbhai"]},
        {"area": "Sports Complex", "name": "Uttam Vaghela", "phone": "", "pay_code": "428", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Uttam Vaghela", "Vaghela Uttambhai"]},
        {"area": "Sports Complex", "name": "Rajendra Bhai Chavda", "phone": "", "pay_code": "354", "worker_type": "floor", "shift": "evening", "is_reliever": False, "legacy_names": ["Rajendra Chavda", "Rajendra Bhai chavda", "Rajendra Amathabhai Chavda"]},
    ]

    RESEARCH_SUPERVISOR_BY_AREA = {
        "Research Park": "maulik.patel",
    }

    RESEARCH_TARGET_ROSTER = [
        {"area": "Research Park", "name": "Mahesh Solanki", "phone": "7046959603", "pay_code": "267", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Mahesh Solanki"]},
        {"area": "Research Park", "name": "Thakor Ajaykumar Prahladji", "phone": "8780940745", "pay_code": "349", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Ajay Thakor", "Thakor Ajaykumar Prahladji"]},
        {"area": "Research Park", "name": "Sailesh A Vaghela", "phone": "7284950619", "pay_code": "266", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Shailesh Vaghela", "Sailesh Vaghela", "Vaghela Shaileshbhai", "Vaghela Shaileshkumar"]},
        {"area": "Research Park", "name": "Vaghela Dharmishtha Ben", "phone": "9328002335", "pay_code": "264", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Dharmishtaben", "Vaghela Dharmishtha Ben"]},
    ]

    SWM_SUPERVISOR_BY_AREA = {
        "Solid Waste Management": "pradip.swm",
    }

    SWM_TARGET_ROSTER = [
        {"area": "Solid Waste Management", "name": "Jitendrakumar Kantiji Thakor", "phone": "", "pay_code": "238", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": ["Jitendra bhai Thakur"]},
        {"area": "Solid Waste Management", "name": "Kantiji Varvaji Thakor", "phone": "", "pay_code": "140", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": ["Kanti bhai Thakur", "Kanti bhai Thakor"]},
        {"area": "Solid Waste Management", "name": "Baldevbhai Mohanbhai Vaghela", "phone": "", "pay_code": "124", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": ["Baldevbhai Vaghela"]},
        {"area": "Solid Waste Management", "name": "Kishankumar Yogeshji Thakor", "phone": "", "pay_code": "479", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": []},
        {"area": "Solid Waste Management", "name": "Shaileshbhai Mahendrabhai Vaghela", "phone": "", "pay_code": "453", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": ["Saleshbhai Vaghela", "Shaileshbhai Vaghela"]},
        {"area": "Solid Waste Management", "name": "Shaileshbhai Kaluji Thakor", "phone": "", "pay_code": "66", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": ["Salesh bhai Thakur", "Shailesh bhai Thakur"]},
        {"area": "Solid Waste Management", "name": "Shaileshkumar Ramanbhai Solanki", "phone": "", "pay_code": "443", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": []},
        {"area": "Solid Waste Management", "name": "Rajnikant Narsinhbhai Parmar", "phone": "", "pay_code": "444", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": ["Rajnibhai Parmar", "Rajnikant Parmar"]},
        {"area": "Solid Waste Management", "name": "Sedhaji Amratbhai Raval", "phone": "", "pay_code": "409", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": ["Satish bhai Raval"]},
        {"area": "Solid Waste Management", "name": "Haribhai Amratbhai Parmar", "phone": "", "pay_code": "480", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": []},
        {"area": "Solid Waste Management", "name": "Naginbhai Babubhai Chauhan", "phone": "", "pay_code": "063", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": ["Naveenbhai Chauhan"]},
        {"area": "Solid Waste Management", "name": "Dineshbhai Babubhai Chauhan", "phone": "", "pay_code": "146", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": []},
        {"area": "Solid Waste Management", "name": "Sunilbhai Prabhatji Thakor", "phone": "", "pay_code": "407", "worker_type": "swm", "shift": "day", "is_reliever": False, "legacy_names": []},
    ]

    SCHEDULE_UPDATES = [
        ("Guest House New", "floor", 1, "Raju: Ground Floor Office, Reception and Front Corridor", "Dusting, sweeping and mopping"),
        ("Guest House New", "floor", 2, "Raju: Parking, Washroom and Lobby Touch Up", "Ladies/Gents/Handicapped washroom, lobby and dining passage"),
        ("Guest House New", "floor", 3, "Raju: Front Glass, Lift and Ground Floor Final Round", ""),
        ("Guest House New", "floor", 4, "Raju: Lunch Break", ""),
        ("Guest House New", "floor", 5, "Raju: Washroom Touch Up", ""),
        ("Guest House New", "floor", 6, "Raju: Rooms Back Side Area Sweeping", ""),
        ("Guest House New", "floor", 7, "Raju: Gym Area and Equipment Dusting", ""),
        ("Guest House New", "floor", 8, "Raju: All Floor Coolers and Washroom Cleaning", ""),
        ("Guest House New", "room", 1, "Dhaval + Ajay + Sumit + Vishal: Checkout/Occupied/Vacant Rooms", "Morning room operations"),
    ]

    REMOVED_SPECIAL_TASKS = [
        ("Guest House New", "Supervisor: Weekly Off and Reliever Roster Check"),
        ("Director Bungalow", "Supervisor: Weekly Off Coverage Check"),
    ]

    HOSTEL_SUPERVISOR_BY_AREA = {
        "Aibaan": "priyanka",
        "Beuaki": "anita",
        "Chimair": "anita",
        "Ijokha": "rushita",
        "Duven": "pankaj",
        "Emiet": "pankaj",
        "Firpeal": "anil.caretaker",
        "Griwiksh": "anil.caretaker",
        "Hiqom": "nikul.caretaker",
        "Jurqia": "jaimin",
        "Lekhaag": "jaimin",
        "Kyzeel": "ramsingh",
        "Hostel Common Area": "vishwajeet",
    }

    HOSTEL_TARGET_ROSTER = [
        {"area": "Aibaan", "name": "Parmar Ritaben", "phone": "9574379477", "pay_code": "357", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Reeta Ben"]},
        {"area": "Aibaan", "name": "Jadav Minaben", "phone": "9909679865", "pay_code": "76", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Meena Ben"]},
        {"area": "Aibaan", "name": "Kailashben Parmar", "phone": "7265921026", "pay_code": "143", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Kailash B"]},
        {"area": "Beuaki", "name": "Shilpaben D Chauhan", "phone": "6356046585", "pay_code": "419", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Shilpa Ben"]},
        {"area": "Beuaki", "name": "Solanki Bhanuben Jagdishbhai", "phone": "7567371788", "pay_code": "332", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Bhanu Ben"]},
        {"area": "Beuaki", "name": "Solanki Suryaben Bharatbhai", "phone": "9725963299", "pay_code": "233", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Surya Ben"]},
        {"area": "Chimair", "name": "Kailashben Vaghela", "phone": "8490053837", "pay_code": "98", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Kailashben M"]},
        {"area": "Chimair", "name": "Gitaben Parmar", "phone": "7041016942", "pay_code": "230", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Geeta Ben"]},
        {"area": "Chimair", "name": "Sonala Manishaben", "phone": "9157691322", "pay_code": "356", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Manisha Ben"]},
        {"area": "Ijokha", "name": "Vaghela Sangitaben", "phone": "8866941201", "pay_code": "219", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Sangeeta Ben"]},
        {"area": "Ijokha", "name": "Rathod Sonalben Dilipkumar", "phone": "7359834672", "pay_code": "415", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Sonal Ben"]},
        {"area": "Ijokha", "name": "Champaben Vaghela", "phone": "8140558882", "pay_code": "249", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Champa Ben"]},
        {"area": "Duven", "name": "Rathod Shaileshbhai", "phone": "9081107066", "pay_code": "239", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Shailesh Rathod"]},
        {"area": "Duven", "name": "Rajanikant Chavda", "phone": "6355825476", "pay_code": "153", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Rajnikant", "Rajanikant"]},
        {"area": "Duven", "name": "Harishkumar Solanki", "phone": "7698462575", "pay_code": "122", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Harish"]},
        {"area": "Emiet", "name": "Solanki Nikulbhai Rajeshbhai", "phone": "8238759843", "pay_code": "446", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Nikul Solanki"]},
        {"area": "Emiet", "name": "Jagdishbhai Shivabhai Chavada", "phone": "9662312505", "pay_code": "157", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Jagdish"]},
        {"area": "Emiet", "name": "Mahendra D Makvana", "phone": "7041143190", "pay_code": "148", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Mahendra Makwana"]},
        {"area": "Firpeal", "name": "Parmar Anandkumar", "phone": "9023393753", "pay_code": "310", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Anand"]},
        {"area": "Firpeal", "name": "Satishbhai Vaniya", "phone": "9558903676", "pay_code": "113", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Satish"]},
        {"area": "Firpeal", "name": "Solanki Jaydip Mahendrabhai", "phone": "9727981188", "pay_code": "259", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Jaydeep Solanki"]},
        {"area": "Griwiksh", "name": "Karan Vaghela", "phone": "7016522113", "pay_code": "260", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Karan"]},
        {"area": "Griwiksh", "name": "Jignesbhai Madhabhai Tumbadiya", "phone": "8401617156", "pay_code": "115", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Jignesh", "Jigneshkumar Babubhai Solanki"]},
        {"area": "Griwiksh", "name": "Shailesh Bhangi", "phone": "8734987012", "pay_code": "109", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Sailesh Vaghela"]},
        {"area": "Hiqom", "name": "Rajendrabhai Chandubhai Vaghela", "phone": "8141885315", "pay_code": "121", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Mukesh", "Mukeshbhai Ravjibhai Vaghela"]},
        {"area": "Hiqom", "name": "Solanki Jayakeshkumar", "phone": "8401531547", "pay_code": "449", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Jaykesh"]},
        {"area": "Hiqom", "name": "Solanki Chandrkant", "phone": "7201863872", "pay_code": "283", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Chandrakant"]},
        {"area": "Hiqom", "name": "Piwal Jitendrabhai Manoharbhai", "phone": "9723216455", "pay_code": "95", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Jitendra"]},
        {"area": "Hiqom", "name": "Ravikumar Ambalal Bhangi", "phone": "7383342914", "pay_code": "245", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Ravi"]},
        {"area": "Jurqia", "name": "Rakeshbhai Chavada", "phone": "9316531354", "pay_code": "438", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Rakesh"]},
        {"area": "Jurqia", "name": "Talavadi Shaileshbhai Ramanbhai", "phone": "8866886040", "pay_code": "97", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Shailesh Talvadi"]},
        {"area": "Jurqia", "name": "Vaghela Pravinbhai", "phone": "8511376344", "pay_code": "246", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Pravin Vaghela"]},
        {"area": "Jurqia", "name": "Bansi Bhangi", "phone": "9023507559", "pay_code": "149", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Banshi"]},
        {"area": "Lekhaag", "name": "Sureshbhai Dahyabhai Solanki", "phone": "9687317660", "pay_code": "73", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Suresh Solanki"]},
        {"area": "Lekhaag", "name": "Naresh Parmar", "phone": "7284086230", "pay_code": "89", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Naresh"]},
        {"area": "Lekhaag", "name": "Nitin Ishwarbhai Makwana", "phone": "9157708871", "pay_code": "261", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Nitin Makwana"]},
        {"area": "Lekhaag", "name": "Pravinbhai Motibhai Mahida", "phone": "9265530235", "pay_code": "91", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Pravin Maida"]},
        {"area": "Kyzeel", "name": "Parmar Prahladbhai", "phone": "8734949909", "pay_code": "242", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Prahlad Parmar"]},
        {"area": "Kyzeel", "name": "Amitkumar Vaghela", "phone": "7779004437", "pay_code": "110", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Amit"]},
        {"area": "Kyzeel", "name": "Rathod Mehulkumar", "phone": "6353451489", "pay_code": "256", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Mehul Rathod"]},
        {"area": "Kyzeel", "name": "Talavadi Rajeshkumar", "phone": "7046510026", "pay_code": "104", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Rajesh", "Parmar Rajeshbhai"]},
        {"area": "Kyzeel", "name": "Mehulkumar Jadeja", "phone": "7096229284", "pay_code": "106", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Mehul Jadeja"]},
        {"area": "Hostel Common Area", "name": "Yogeshbhai Kantibhai Vaghela", "phone": "9998100804", "pay_code": "80", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Yogesh Vaghela"]},
        {"area": "Hostel Common Area", "name": "Solanki Vinayak", "phone": "9023271834", "pay_code": "240", "worker_type": "washroom", "shift": "night", "is_reliever": False, "legacy_names": ["Vinayak Solanki"]},
        {"area": "Hostel Common Area", "name": "Thakor Anilkumar Naginji", "phone": "9265665289", "pay_code": "542", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Anil Thakur", "Anilkumar Bhupatji Thakor"]},
        {"area": "Hostel Common Area", "name": "Suresh", "phone": "", "pay_code": "", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Suresh"]},
        {"area": "Hostel Common Area", "name": "Krunal", "phone": "", "pay_code": "", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Krunal", "Solanki Krunal Amrutbhai"]},
        {"area": "Hostel Common Area", "name": "Gurjar Ketan Amrutbhai", "phone": "8347139138", "pay_code": "100", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Ketan Gujjar"]},
        {"area": "Hostels Reliever", "name": "Dipikaben Hasamukhbhai Parmar", "phone": "7383512108", "pay_code": "418", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Deepika Ben"]},
        {"area": "Hostels Reliever", "name": "Mittalben Vaghela", "phone": "7383619204", "pay_code": "386", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Mital Ben"]},
        {"area": "Hostels Reliever", "name": "Parmar Vinay Valjibhai", "phone": "8758388061", "pay_code": "136", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Vinay"]},
        {"area": "Hostels Reliever", "name": "Lalabhai Khodabhai Mesariya", "phone": "9726303104", "pay_code": "154", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Lala"]},
        {"area": "Hostels Reliever", "name": "Gurjar Hashamukhbhai M", "phone": "9714466201", "pay_code": "75", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Hasmukhbhai"]},
        {"area": "Hostels Reliever", "name": "Babariya Umesh", "phone": "9313230372", "pay_code": "435", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Umesh Babariya"]},
        {"area": "Hostels Reliever", "name": "Rajendrabhai Chandubhai Vaghela", "phone": "9924301124", "pay_code": "121", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Rajendra"]},
        {"area": "Hostels Reliever", "name": "Dhiraj Solanki", "phone": "9979030157", "pay_code": "131", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Dhiraj"]},
        {"area": "Hostels Reliever", "name": "Solanki Mayur Jashubhai", "phone": "9099743600", "pay_code": "258", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Mayur"]},
    ]

    ACADEMIC_SUPERVISOR_BY_AREA = {
        "Academic Block 1": "mukesh.vaghela",
        "Academic Block 2": "mukesh.vaghela",
        "Academic Block 3": "bipin.vaghela",
        "Academic Block 4": "bipin.vaghela",
        "Academic Block 5": "mukesh.vaghela",
        "Academic Block 6": "mukesh.vaghela",
        "Academic Block 7": "bipin.vaghela",
        "Academic Block 8": "mukesh.vaghela",
        "Academic Block 9": "bipin.vaghela",
        "Academic Block 10": "shailesh.prajapati",
        "Academic Block 11": "shailesh.prajapati",
        "Academic Block 12": "kaushik.parmar",
        "Academic Block 13": "kaushik.parmar",
        "Old Academic Common Area": "bipin.vaghela",
        "New AB U-Shape": "shailesh.prajapati",
        "New Academic Common Area": "kaushik.parmar",
        "Old Academic Reliever": "mukesh.vaghela",
        "New Academic Reliever": "kaushik.parmar",
    }

    ACADEMIC_TARGET_ROSTER = [
        {"area": "Academic Block 1", "name": "Minaben Vaghela", "phone": "9081897577", "pay_code": "142", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Minaben", "Jadav Minaben"]},
        {"area": "Academic Block 2", "name": "Rajanikant Babubhai Vaghela", "phone": "8490949636", "pay_code": "103", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Rajnibhai", "Rajanikant"]},
        {"area": "Academic Block 3", "name": "Solanki Krunal Amrutbhai", "phone": "9327124093", "pay_code": "235", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Krunal"]},
        {"area": "Academic Block 3", "name": "Vaghela Rakeshbhai Ambalal", "phone": "9313622323", "pay_code": "108", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Rakeshbhai"]},
        {"area": "Academic Block 3", "name": "Vasantiben Jitendrabhai Vora", "phone": "9824018730", "pay_code": "101", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Vasantiben", "Vasantiben J Vora"]},
        {"area": "Academic Block 4", "name": "Rathod Varshaben", "phone": "8490949636", "pay_code": "156", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Varshaben"]},
        {"area": "Academic Block 4", "name": "Rathod Hiteshkumar", "phone": "9723883180", "pay_code": "138", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Hitesh", "Hitesh D Rathore"]},
        {"area": "Academic Block 4", "name": "Solanki Harshadbhai Dineshbhai", "phone": "9998362377", "pay_code": "280", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Harshad"]},
        {"area": "Academic Block 5", "name": "Solanki Dineshkumar Vinubhai", "phone": "9714159412", "pay_code": "83", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Dinesh", "Dineshbhai Purohit"]},
        {"area": "Academic Block 5", "name": "Parmar Anjanaben Kalpeshkumar", "phone": "6351220899", "pay_code": "130", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Anjanaben"]},
        {"area": "Academic Block 5", "name": "Vaghela Shaileshbhai", "phone": "8155861394", "pay_code": "82", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Shaileshbhai", "Shailesh Vaghela"]},
        {"area": "Academic Block 6", "name": "Chauhan Nilamben", "phone": "7041529877", "pay_code": "410", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Nilamben", "Nilamben H Chouhan"]},
        {"area": "Academic Block 6", "name": "Ashokkumar Maheriya", "phone": "7383949367", "pay_code": "114", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Ashok", "Ashok S Mesaria"]},
        {"area": "Academic Block 6", "name": "Hitenkumar Parmar", "phone": "8866745431", "pay_code": "307", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Hiten", "Hiten R Parmar"]},
        {"area": "Academic Block 7", "name": "Gurjar Chandrikaben", "phone": "9737520471", "pay_code": "74", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Chandrikaben"]},
        {"area": "Academic Block 7", "name": "Parmar Nikulkumar Punjabhai", "phone": "8155861394", "pay_code": "309", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Nikhil", "Nikul", "Elesh"]},
        {"area": "Old Academic Reliever", "name": "Ajaykumar Solanki", "phone": "8401109316", "pay_code": "281", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Ajay", "Satish bhai Raval"]},
        {"area": "Old Academic Reliever", "name": "Solanki Akashkumar Hasmukhbhai", "phone": "8160847423", "pay_code": "253", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Akash"]},
        {"area": "Old Academic Reliever", "name": "Pravinbhai Vaghela", "phone": "9624126018", "pay_code": "400", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Pravinbhai M Vaghela"]},
        {"area": "Old Academic Reliever", "name": "Jyotsanaben Vaghela", "phone": "9574720027", "pay_code": "231", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Jyostnaben A Vaghela", "Jyostnaben"]},
        {"area": "Academic Block 9", "name": "Jay Kumar Solanki", "phone": "8511476360", "pay_code": "105", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Jay", "Jay Solanki"]},
        {"area": "Academic Block 10", "name": "Solanki Parthkumar Jagdishbhai", "phone": "", "pay_code": "384", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Parth Solanki"]},
        {"area": "Academic Block 10", "name": "Hiteshbhai Solanki", "phone": "", "pay_code": "434", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Hitesh Solanki"]},
        {"area": "Academic Block 10", "name": "Patel Sangitaben Maheshbhai", "phone": "", "pay_code": "412", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Sangitaben", "Sangeetaben Patel", "Retuben Solanki"]},
        {"area": "Academic Block 11", "name": "Makwana Sunilbhai Amrutbhai", "phone": "", "pay_code": "348", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Sunil Makwana"]},
        {"area": "Academic Block 11", "name": "Bhangi Ileshbhai Ishvarbhai", "phone": "", "pay_code": "361", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Elesh", "Elesh Bhangi", "Elesh bhange", "Parmar Nikulkumar Punjabhai"]},
        {"area": "Academic Block 11", "name": "Kailashben Parmar", "phone": "", "pay_code": "102", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Kailashben", "Kailash ben", "Kailish ben"]},
        {"area": "Academic Block 12", "name": "Gautambhai Vaghela", "phone": "", "pay_code": "333", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Gautam Vaghela"]},
        {"area": "Academic Block 12", "name": "Parmar Devendra Dalpatbhai", "phone": "", "pay_code": "437", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Devendra"]},
        {"area": "Academic Block 12", "name": "Sonala Manishaben", "phone": "", "pay_code": "356", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Chandrika ben", "Chandrikaben", "Manisha Ben"]},
        {"area": "Academic Block 13", "name": "Vaghela Maheshbhai Dineshbhai", "phone": "", "pay_code": "402", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Mahesh Solanki", "Mahesh Vaghela", "Mahesh Raval"]},
        {"area": "Academic Block 13", "name": "Vaghela Padma", "phone": "", "pay_code": "347", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Padmaben Vaghela", "Padma"]},
        {"area": "Academic Block 13", "name": "Rathod Ajaykumar", "phone": "", "pay_code": "93", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Ajay Rathod"]},
        {"area": "Academic Block 13", "name": "Parmar Krunalbhai", "phone": "", "pay_code": "390", "worker_type": "room", "shift": "day", "is_reliever": False, "legacy_names": ["Krunal Parmar", "Kunal Parmar"]},
        {"area": "Academic Block 13", "name": "Jigneshkumar Babubhai Solanki", "phone": "", "pay_code": "363", "worker_type": "washroom", "shift": "day", "is_reliever": False, "legacy_names": ["Jignesh Solanki", "Gignesh"]},
        {"area": "Old Academic Common Area", "name": "Vaghela Bhaveshbhai Narnabhai", "phone": "9974738575", "pay_code": "315", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Bhavesh"]},
        {"area": "Old Academic Common Area", "name": "Vaniya Nikhilkumar Bhaveshbhai", "phone": "8849436518", "pay_code": "314", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Nikhil"]},
        {"area": "New AB U-Shape", "name": "Akshybhai Vaghela", "phone": "", "pay_code": "308", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Akshay Parmar", "Akshay Vaghela", "Hiteshkumar Gafulbhai Vaghela"]},
        {"area": "New Academic Common Area", "name": "Vasudev Jitendrakumar Baldevbhai", "phone": "", "pay_code": "377", "worker_type": "floor", "shift": "day", "is_reliever": False, "legacy_names": ["Jitendra Vasudev"]},
        {"area": "New Academic Reliever", "name": "Gurjar Niruben", "phone": "", "pay_code": "111", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Neru ben", "Niruben"]},
        {"area": "New Academic Reliever", "name": "Sonara Hitendrakumar Punjabhai", "phone": "", "pay_code": "448", "worker_type": "reliever", "shift": "day", "is_reliever": True, "legacy_names": ["Hitendra sonara", "Hitendra Sonara", "Hiten"]},
    ]

    ACADEMIC_SCHEDULE_UPDATES = [
        ("Academic Block 2", "floor", 1, "AB-2: Main Fountain Area Cleaning", "Rajanikant"),
        ("Academic Block 3", "washroom", 1, "AB-3: All Floors Washroom Touch Up", "Krunal + Rakesh + Vasantiben"),
        ("Academic Block 4", "washroom", 1, "AB-4: Washroom Touch Up", "Varshaben + Hitesh + Harshad"),
        ("Academic Block 7", "washroom", 1, "AB-7: Washroom Touch Up", "Chandrikaben + Nikul"),
        ("Academic Block 8", "floor", 1, "AB-8: Lal Minar Tower Cleaning Support", "Ajay + Akash + Pravin + Jyotsanaben"),
        ("Academic Block 8", "floor", 2, "AB-8: First Floor Passage and Ramp Cleaning", ""),
        ("Academic Block 8", "floor", 4, "AB-8: Indoor Sweeping and Mopping", "Every 15 days"),
        ("Academic Block 8", "floor", 5, "AB-8: Month-end Additional Cleaning Check", "Month ending 2 times"),
        ("Old Academic Common Area", "floor", 1, "Old Academic Common Area: All Blocks Common Area + Marble Cleaning", "Bhavesh + Nikhil"),
        ("Old Academic Common Area", "floor", 3, "Old Academic Common Area: Block-07 Terrace Side Railing Dusting", ""),
        ("Old Academic Common Area", "all", 1, "Sunday Deep Clean: Old Academic Common Area Samved Area Scrubbing and Washing", "Weekly Sunday task"),
        ("New Academic Common Area", "floor", 1, "New Academic Common Area: Sweeping and Mopping", "Jitendra Vasudev"),
        ("New Academic Common Area", "floor", 2, "New Academic Common Area: Blocks 10-13 Common Area Cleaning - Round 1", ""),
        ("New Academic Common Area", "floor", 4, "New Academic Common Area: Blocks 10-13 Common Area Cleaning - Round 2", ""),
    ]

    def add_arguments(self, parser):
        parser.add_argument("--quiet", action="store_true", help="Reduce log output.")

    def _ensure_academic_area_name(self, old_name, new_name):
        old_area = HKArea.objects.filter(name=old_name).first()
        new_area = HKArea.objects.filter(name=new_name).first()
        if old_area and not new_area:
            old_area.name = new_name
            old_area.area_type = "academic"
            old_area.is_active = True
            old_area.save(update_fields=["name", "area_type", "is_active"])
            return

        HKArea.objects.get_or_create(name=new_name, defaults={"area_type": "academic"})
        HKArea.objects.filter(name=new_name).update(area_type="academic", is_active=True)

    def _ensure_active_area(self, name, area_type="academic"):
        area, _ = HKArea.objects.get_or_create(name=name, defaults={"area_type": area_type})
        HKArea.objects.filter(pk=area.pk).update(area_type=area_type, is_active=True)
        return HKArea.objects.get(pk=area.pk)

    def _ensure_user_area_assignment(self, users_by_username, supervisor_by_area):
        for area_name, username in supervisor_by_area.items():
            user = users_by_username.get(username)
            area = HKArea.objects.filter(name=area_name, is_active=True).first()
            if user and area:
                HKUserArea.objects.get_or_create(user=user, area=area)

    def _restore_academic_block_8_templates(self):
        academic_block_8 = self._ensure_active_area("Academic Block 8")
        old_academic_reliever = HKArea.objects.filter(name="Old Academic Reliever", is_active=True).first()

        if old_academic_reliever:
            HKScheduleTemplate.objects.filter(area=old_academic_reliever).update(area=academic_block_8)

        task_defaults = [
            (1, datetime.time(8, 0), datetime.time(12, 0), "AB-8: Lal Minar Tower Cleaning Support", "Ajay + Akash + Pravin + Jyotsanaben"),
            (2, datetime.time(12, 0), datetime.time(13, 0), "AB-8: First Floor Passage and Ramp Cleaning", ""),
            (3, datetime.time(13, 0), datetime.time(14, 0), "Lunch Break", ""),
            (4, datetime.time(14, 0), datetime.time(16, 0), "AB-8: Indoor Sweeping and Mopping", "Every 15 days"),
            (5, datetime.time(16, 0), datetime.time(17, 0), "AB-8: Month-end Additional Cleaning Check", "Month ending 2 times"),
        ]
        for order, start_time, end_time, task_name, task_description in task_defaults:
            template, _ = HKScheduleTemplate.objects.get_or_create(
                area=academic_block_8,
                worker_tag="floor",
                frequency="daily",
                order=order,
                defaults={
                    "start_time": start_time,
                    "end_time": end_time,
                    "task_name": task_name,
                    "task_description": task_description,
                    "requires_photo": order != 3,
                    "is_active": True,
                },
            )
            changed = False
            if template.start_time != start_time:
                template.start_time = start_time
                changed = True
            if template.end_time != end_time:
                template.end_time = end_time
                changed = True
            if template.task_name != task_name:
                template.task_name = task_name
                changed = True
            if template.task_description != task_description:
                template.task_description = task_description
                changed = True
            if template.requires_photo != (order != 3):
                template.requires_photo = (order != 3)
                changed = True
            if not template.is_active:
                template.is_active = True
                changed = True
            if changed:
                template.save(update_fields=[
                    "start_time",
                    "end_time",
                    "task_name",
                    "task_description",
                    "requires_photo",
                    "is_active",
                ])

    def handle(self, *args, **options):
        quiet = options["quiet"]
        User = get_user_model()
        self._ensure_academic_area_name("Academic Common Area", "Old Academic Common Area")
        self._ensure_academic_area_name("New Academy", "New Academic Common Area")
        self._ensure_academic_area_name("Academic Block 8", "Old Academic Reliever")
        self._ensure_active_area("Academic Block 8")
        HKArea.objects.get_or_create(name="New Academic Reliever", defaults={"area_type": "academic"})
        HKArea.objects.filter(name="New Academic Reliever").update(area_type="academic", is_active=True)
        full_roster = (
            self.TARGET_ROSTER
            + self.BHARAT_TARGET_ROSTER
            + self.RESEARCH_TARGET_ROSTER
            + self.SWM_TARGET_ROSTER
            + self.HOSTEL_TARGET_ROSTER
            + self.ACADEMIC_TARGET_ROSTER
        )
        supervisor_by_area = {}
        supervisor_by_area.update(self.BHARAT_SUPERVISOR_BY_AREA)
        supervisor_by_area.update(self.RESEARCH_SUPERVISOR_BY_AREA)
        supervisor_by_area.update(self.SWM_SUPERVISOR_BY_AREA)
        supervisor_by_area.update(self.HOSTEL_SUPERVISOR_BY_AREA)
        supervisor_by_area.update(self.ACADEMIC_SUPERVISOR_BY_AREA)

        supervisor_usernames = {"ashok.rathod"}
        supervisor_usernames.update(self.BHARAT_SUPERVISOR_BY_AREA.values())
        supervisor_usernames.update(self.RESEARCH_SUPERVISOR_BY_AREA.values())
        supervisor_usernames.update(self.SWM_SUPERVISOR_BY_AREA.values())
        supervisor_usernames.update(self.HOSTEL_SUPERVISOR_BY_AREA.values())
        supervisor_usernames.update(self.ACADEMIC_SUPERVISOR_BY_AREA.values())
        supervisors_by_username = {
            user.username: user
            for user in User.objects.filter(username__in=sorted(supervisor_usernames))
        }
        self._ensure_user_area_assignment(supervisors_by_username, supervisor_by_area)

        if "ashok.rathod" not in supervisors_by_username:
            self.stderr.write("Supervisor ashok.rathod not found; sync skipped.")
            return

        missing_supervisors = sorted(
            username for username in supervisor_usernames if username not in supervisors_by_username
        )
        for username in missing_supervisors:
            if not quiet:
                self.stderr.write(
                    f"Supervisor/caretaker {username} not found; keeping existing assignment when possible."
                )

        areas = {
            name: HKArea.objects.filter(name=name).first()
            for name in {spec["area"] for spec in full_roster}
        }
        missing_areas = sorted(name for name, area in areas.items() if area is None)
        if missing_areas:
            self.stderr.write("Required housekeeping areas not found; sync skipped.")
            return

        all_workers = list(HKWorker.objects.select_related("area"))
        keep_ids = set()
        touched = 0

        for spec in full_roster:
            area = areas[spec["area"]]
            worker = self._find_worker(spec, area, all_workers, keep_ids)
            created = False
            if worker is None:
                worker = HKWorker(area=area)
                created = True

            default_supervisor_username = (
                "ashok.rathod"
                if spec["area"] in {"Guest House New", "Director Bungalow"}
                else None
            )
            assigned_supervisor = supervisors_by_username.get(
                spec.get("supervisor_username")
                or supervisor_by_area.get(spec["area"])
                or default_supervisor_username
            )

            worker.name = spec["name"]
            if spec["phone"] or not worker.phone:
                worker.phone = spec["phone"]
            worker.pay_code = spec["pay_code"]
            worker.worker_type = spec["worker_type"]
            worker.shift = spec["shift"]
            worker.area = area
            if assigned_supervisor is not None:
                worker.supervisor = assigned_supervisor
            worker.is_reliever = spec["is_reliever"]
            worker.is_active = True
            worker.save()

            if created:
                all_workers.append(worker)
            keep_ids.add(worker.id)
            touched += 1
            if not quiet:
                action = "created" if created else "synced"
                self.stdout.write(f"[{action}] {worker.area.name}: {worker.name} ({worker.pay_code})")

        # Deactivate outdated workers in the managed target areas so attendance only shows the real roster.
        old_area_workers = HKWorker.objects.filter(
            area__name__in=sorted(areas),
            is_active=True,
        ).exclude(id__in=keep_ids)
        old_area_count = old_area_workers.count()
        old_area_workers.update(is_active=False)

        duplicate_count = self._deactivate_cross_area_pay_code_duplicates(full_roster, keep_ids)
        duplicate_deleted, duplicate_history_rows = self._cleanup_duplicate_active_pay_codes(keep_ids)
        deleted_unused, kept_with_history = self._cleanup_unused_inactive_workers()
        self._restore_academic_block_8_templates()

        schedule_updates = 0
        for area_name, worker_tag, order, task_name, task_description in self.SCHEDULE_UPDATES + self.ACADEMIC_SCHEDULE_UPDATES:
            schedule_updates += HKScheduleTemplate.objects.filter(
                area__name=area_name,
                worker_tag=worker_tag,
                order=order,
            ).update(task_name=task_name, task_description=task_description)

        removed_special_tasks = 0
        for area_name, task_name in self.REMOVED_SPECIAL_TASKS:
            removed_special_tasks += HKScheduleTemplate.objects.filter(
                area__name=area_name,
                worker_tag="all",
                task_name=task_name,
            ).delete()[0]

        balanced_templates = self._rebalance_daily_worker_schedules()

        if not quiet:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Synced housekeeping roster: {touched} workers, "
                    f"deactivated {old_area_count} outdated area rows, "
                    f"deactivated {duplicate_count} duplicate pay-code rows outside target areas, "
                    f"deleted {duplicate_deleted} duplicate active rows, "
                    f"kept {duplicate_history_rows} history-backed duplicate rows inactive, "
                    f"deleted {deleted_unused} unused inactive rows, "
                    f"kept {kept_with_history} history-backed inactive rows, "
                    f"updated {schedule_updates} schedule rows, "
                    f"removed {removed_special_tasks} legacy special tasks, "
                    f"rebalanced {balanced_templates} worker schedule slots."
                )
            )

    def _rebalance_daily_worker_schedules(self):
        updated_templates = []
        areas = list(HKArea.objects.filter(is_active=True).order_by("name"))
        for area in areas:
            area_workers = list(HKWorker.objects.filter(area=area, is_active=True).order_by("name"))
            for worker_tag in ("floor", "room", "washroom", "general"):
                templates = list(
                    HKScheduleTemplate.objects.filter(
                        area=area,
                        is_active=True,
                        frequency="daily",
                        worker_tag=worker_tag,
                    ).order_by("order", "start_time", "id")
                )
                if not templates:
                    continue
                lanes = self._build_lanes(area_workers, worker_tag, templates)
                for lane in lanes:
                    updated_templates.extend(self._rebalance_lane(lane))

        if updated_templates:
            HKScheduleTemplate.objects.bulk_update(updated_templates, ["start_time", "end_time"])
        return len(updated_templates)

    def _build_lanes(self, area_workers, worker_tag, templates):
        worker_pool = [
            worker for worker in area_workers
            if worker.worker_type == worker_tag and not worker.is_reliever
        ]
        if not worker_pool:
            worker_pool = [worker for worker in area_workers if worker.worker_type == worker_tag]
        worker_count = max(1, len(worker_pool))
        worker_tokens = self._worker_tokens(worker_pool or area_workers)

        named_lanes = {}
        unnamed_templates = []
        for template in templates:
            lane_key = self._extract_lane_key(template.task_name, worker_tokens)
            if lane_key:
                named_lanes.setdefault(lane_key, []).append(template)
            else:
                unnamed_templates.append(template)

        lanes = [sorted(lane, key=self._template_sort_key) for lane in named_lanes.values()]
        if unnamed_templates:
            if lanes:
                lane_totals = [sum(item.duration_minutes for item in lane) for lane in lanes]
                for template in unnamed_templates:
                    smallest_idx = min(range(len(lanes)), key=lambda idx: lane_totals[idx])
                    lanes[smallest_idx].append(template)
                    lane_totals[smallest_idx] += template.duration_minutes
            elif worker_count > 1:
                distributed = [[] for _ in range(worker_count)]
                for index, template in enumerate(unnamed_templates):
                    distributed[index % worker_count].append(template)
                lanes.extend(lane for lane in distributed if lane)
            else:
                lanes.append(list(unnamed_templates))

        return [sorted(lane, key=self._template_sort_key) for lane in lanes if lane]

    def _rebalance_lane(self, templates):
        lane = sorted(templates, key=self._template_sort_key)
        if not lane:
            return []

        if len(lane) == 1:
            template = lane[0]
            start_minutes = (template.start_time.hour * 60) + template.start_time.minute
            end_minutes = (template.end_time.hour * 60) + template.end_time.minute
            if end_minutes <= start_minutes:
                end_minutes += 24 * 60
            if WORKDAY_START_MINUTES <= start_minutes and end_minutes <= WORKDAY_END_MINUTES:
                return []
            template.start_time = _minutes_to_time(WORKDAY_START_MINUTES)
            template.end_time = _minutes_to_time(WORKDAY_END_MINUTES)
            return [template]

        raw_durations = [max(5, template.duration_minutes) for template in lane]
        scaled_durations = self._scaled_durations(raw_durations, WORKDAY_TOTAL_MINUTES)
        cursor = WORKDAY_START_MINUTES
        changed = []
        for template, duration in zip(lane, scaled_durations):
            next_cursor = min(WORKDAY_END_MINUTES, cursor + duration)
            start_time = _minutes_to_time(cursor)
            end_time = _minutes_to_time(next_cursor)
            if template.start_time != start_time or template.end_time != end_time:
                template.start_time = start_time
                template.end_time = end_time
                changed.append(template)
            cursor = next_cursor

        final_end_time = _minutes_to_time(WORKDAY_END_MINUTES)
        if lane[-1].end_time != final_end_time:
            lane[-1].end_time = final_end_time
            if lane[-1] not in changed:
                changed.append(lane[-1])
        return changed

    def _scaled_durations(self, raw_durations, target_total):
        total = sum(raw_durations) or len(raw_durations) or 1
        exact = [(duration * target_total) / total for duration in raw_durations]
        scaled = [max(5, int(value)) for value in exact]
        remainder = target_total - sum(scaled)

        if remainder > 0:
            ranked = sorted(
                range(len(exact)),
                key=lambda idx: (exact[idx] - int(exact[idx]), raw_durations[idx]),
                reverse=True,
            )
            for idx in ranked:
                if remainder <= 0:
                    break
                scaled[idx] += 1
                remainder -= 1
        elif remainder < 0:
            ranked = sorted(
                range(len(exact)),
                key=lambda idx: (scaled[idx], raw_durations[idx]),
                reverse=True,
            )
            for idx in ranked:
                while remainder < 0 and scaled[idx] > 5:
                    scaled[idx] -= 1
                    remainder += 1
                if remainder == 0:
                    break

        if remainder != 0 and scaled:
            scaled[-1] = max(5, scaled[-1] + remainder)
        return scaled

    def _worker_tokens(self, workers):
        tokens = set()
        for worker in workers:
            name = (worker.name or "").strip()
            if not name:
                continue
            parts = [part for part in name.replace(".", " ").split() if part]
            tokens.add(_normalize(name))
            for part in parts:
                tokens.add(_normalize(part))
            if len(parts) >= 2:
                tokens.add(_normalize(" ".join(parts[:2])))
        return tokens

    def _extract_lane_key(self, task_name, worker_tokens):
        if not task_name or ":" not in task_name or not worker_tokens:
            return ""
        prefix = task_name.split(":", 1)[0].strip()
        if not prefix:
            return ""
        normalized_parts = []
        split_text = prefix.replace("&", "+").replace("/", "+")
        for part in split_text.split("+"):
            cleaned = _normalize(part)
            if cleaned:
                normalized_parts.append(cleaned)
        if normalized_parts and all(self._matches_worker_token(part, worker_tokens) for part in normalized_parts):
            return prefix
        return ""

    def _matches_worker_token(self, part, worker_tokens):
        if part in worker_tokens:
            return True
        if len(part) < 4:
            return False
        for token in worker_tokens:
            if token.startswith(part) or part.startswith(token):
                return True
        return False

    def _template_sort_key(self, template):
        return (template.order, template.start_time, template.id)

    def _cleanup_unused_inactive_workers(self, area_names=None):
        workers = HKWorker.objects.filter(is_active=False)
        if area_names:
            workers = workers.filter(area__name__in=area_names)
        deleted_ids = []
        kept_with_history = 0
        for worker in workers:
            has_history = self._worker_has_history(worker)
            if has_history:
                kept_with_history += 1
                continue
            deleted_ids.append(worker.id)

        if deleted_ids:
            HKWorker.objects.filter(id__in=deleted_ids).delete()

        return len(deleted_ids), kept_with_history

    def _worker_has_history(self, worker):
        return (
            worker.attendance_records.exists()
            or worker.task_assignments.exists()
            or worker.sunday_incharges.exists()
            or worker.substituted_by.exists()
            or worker.substitution_slots.exists()
            or worker.selection_requests.exists()
            or worker.assigned_daily_records.exists()
            or worker.monthly_reports.exists()
        )

    def _deactivate_cross_area_pay_code_duplicates(self, roster_specs, keep_ids):
        duplicate_count = 0
        allowed_areas_by_pay_code = {}
        for spec in roster_specs:
            pay_code = (spec.get("pay_code") or "").strip()
            if not pay_code:
                continue
            allowed_areas_by_pay_code.setdefault(pay_code, set()).add(spec["area"])

        for pay_code, allowed_areas in allowed_areas_by_pay_code.items():
            duplicate_qs = HKWorker.objects.filter(pay_code=pay_code, is_active=True).exclude(id__in=keep_ids)
            if allowed_areas:
                duplicate_qs = duplicate_qs.exclude(area__name__in=sorted(allowed_areas))
            duplicate_count += duplicate_qs.count()
            duplicate_qs.update(is_active=False)

        return duplicate_count

    def _cleanup_duplicate_active_pay_codes(self, keep_ids):
        deleted_ids = []
        kept_with_history = 0
        duplicate_groups = (
            HKWorker.objects.filter(is_active=True)
            .exclude(pay_code="")
            .values("area_id", "pay_code")
            .annotate(total=Count("id"))
            .filter(total__gt=1)
            .order_by("area_id", "pay_code")
        )

        for group in duplicate_groups:
            workers = list(
                HKWorker.objects.filter(
                    area_id=group["area_id"],
                    pay_code=group["pay_code"],
                    is_active=True,
                ).select_related("area")
            )
            if len(workers) <= 1:
                continue

            history_by_id = {
                worker.id: self._worker_has_history(worker)
                for worker in workers
            }
            keeper = min(
                workers,
                key=lambda worker: (
                    0 if worker.id in keep_ids else 1,
                    0 if history_by_id[worker.id] else 1,
                    0 if (worker.phone or "").strip() else 1,
                    -len((worker.name or "").strip()),
                    worker.id,
                ),
            )

            for worker in workers:
                if worker.id == keeper.id:
                    continue
                if history_by_id[worker.id]:
                    worker.is_active = False
                    worker.save(update_fields=["is_active"])
                    kept_with_history += 1
                    continue
                deleted_ids.append(worker.id)

        if deleted_ids:
            HKWorker.objects.filter(id__in=deleted_ids).delete()

        return len(deleted_ids), kept_with_history

    def _find_worker(self, spec, area, all_workers, keep_ids):
        legacy = {_normalize(spec["name"])}
        legacy.update(_normalize(name) for name in spec.get("legacy_names", []))

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id == area.id and _normalize(worker.name) == _normalize(spec["name"]):
                return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id == area.id and _normalize(worker.name) in legacy:
                return worker

        if spec["phone"]:
            for worker in all_workers:
                if worker.id in keep_ids:
                    continue
                if worker.area_id == area.id and worker.phone == spec["phone"]:
                    return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if spec["pay_code"] and worker.area_id == area.id and worker.pay_code == spec["pay_code"]:
                return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if spec["pay_code"] and worker.pay_code == spec["pay_code"]:
                return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id == area.id and worker.worker_type == spec["worker_type"] and worker.is_reliever == spec["is_reliever"]:
                return worker

        return None
