// The Builder's starter holes, three a world: written by scripts/starters.ts
// (which also finds a holing round of each in every weather, kept for the
// unit test in web/test/builder-starters.json). Do not edit by hand: change
// the script and run it again.
import type { Draft } from "./draft";

export const STARTERS: Readonly<Record<string, Readonly<Record<string, Draft>>>> = {
 "garden": {
  "straight": {
   "v": 1,
   "world": "garden",
   "slug": "",
   "title": "Straight",
   "par": 2,
   "tee": [
    4.5,
    7.5
   ],
   "pin": [
    30.5,
    7.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       33.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       33.5,
       1.5
      ],
      "b": [
       33.5,
       13.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       33.5,
       13.5
      ],
      "b": [
       1.5,
       13.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       13.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "*/post/scarecrow",
     "geometry": {
      "t": "post",
      "c": [
       14.5,
       5
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p2",
     "entry": "*/post/sunflower",
     "geometry": {
      "t": "post",
      "c": [
       20.5,
       10
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  },
  "dogleg": {
   "v": 1,
   "world": "garden",
   "slug": "",
   "title": "Dogleg",
   "par": 3,
   "tee": [
    4.5,
    6.5
   ],
   "pin": [
    26.5,
    23.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       31.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       31.5,
       1.5
      ],
      "b": [
       31.5,
       27.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       31.5,
       27.5
      ],
      "b": [
       21.5,
       27.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       21.5,
       27.5
      ],
      "b": [
       21.5,
       11.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r5",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       21.5,
       11.5
      ],
      "b": [
       1.5,
       11.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r6",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       11.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "*/post/scarecrow",
     "geometry": {
      "t": "post",
      "c": [
       28.5,
       6.5
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  },
  "signature": {
   "v": 1,
   "world": "garden",
   "slug": "",
   "title": "The moon bridge",
   "par": 3,
   "tee": [
    4.5,
    8.5
   ],
   "pin": [
    32.5,
    8.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       35.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       35.5,
       1.5
      ],
      "b": [
       35.5,
       15.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       35.5,
       15.5
      ],
      "b": [
       1.5,
       15.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       15.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "*/slope/moon bridge",
     "geometry": {
      "t": "rect",
      "min": [
       15.5,
       5.5
      ],
      "max": [
       20.5,
       10.5
      ]
     },
     "params": {
      "grade": 0.2,
      "dir": [
       1,
       0
      ]
     },
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  }
 },
 "island": {
  "straight": {
   "v": 1,
   "world": "island",
   "slug": "",
   "title": "Straight",
   "par": 2,
   "tee": [
    4.5,
    7.5
   ],
   "pin": [
    30.5,
    7.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       33.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       33.5,
       1.5
      ],
      "b": [
       33.5,
       13.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       33.5,
       13.5
      ],
      "b": [
       1.5,
       13.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       13.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "island/post/palm",
     "geometry": {
      "t": "post",
      "c": [
       14.5,
       5
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p2",
     "entry": "island/post/coral",
     "geometry": {
      "t": "post",
      "c": [
       20.5,
       10
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  },
  "dogleg": {
   "v": 1,
   "world": "island",
   "slug": "",
   "title": "Dogleg",
   "par": 3,
   "tee": [
    4.5,
    6.5
   ],
   "pin": [
    26.5,
    23.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       31.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       31.5,
       1.5
      ],
      "b": [
       31.5,
       27.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       31.5,
       27.5
      ],
      "b": [
       21.5,
       27.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       21.5,
       27.5
      ],
      "b": [
       21.5,
       11.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r5",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       21.5,
       11.5
      ],
      "b": [
       1.5,
       11.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r6",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       11.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "island/post/palm",
     "geometry": {
      "t": "post",
      "c": [
       28.5,
       6.5
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  },
  "signature": {
   "v": 1,
   "world": "island",
   "slug": "",
   "title": "The tidepool",
   "par": 3,
   "tee": [
    4.5,
    8.5
   ],
   "pin": [
    32.5,
    8.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       35.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       35.5,
       1.5
      ],
      "b": [
       35.5,
       15.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       35.5,
       15.5
      ],
      "b": [
       1.5,
       15.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       15.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "island/hazard/tidepool",
     "geometry": {
      "t": "rect",
      "min": [
       15.5,
       5.5
      ],
      "max": [
       18.5,
       8.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  }
 },
 "town": {
  "straight": {
   "v": 1,
   "world": "town",
   "slug": "",
   "title": "Straight",
   "par": 2,
   "tee": [
    4.5,
    7.5
   ],
   "pin": [
    30.5,
    7.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       33.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       33.5,
       1.5
      ],
      "b": [
       33.5,
       13.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       33.5,
       13.5
      ],
      "b": [
       1.5,
       13.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       13.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "town/post/lamp",
     "geometry": {
      "t": "post",
      "c": [
       14.5,
       5
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p2",
     "entry": "town/post/house",
     "geometry": {
      "t": "post",
      "c": [
       20.5,
       10
      ],
      "r": 2.2
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  },
  "dogleg": {
   "v": 1,
   "world": "town",
   "slug": "",
   "title": "Dogleg",
   "par": 3,
   "tee": [
    4.5,
    6.5
   ],
   "pin": [
    26.5,
    23.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       31.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       31.5,
       1.5
      ],
      "b": [
       31.5,
       27.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       31.5,
       27.5
      ],
      "b": [
       21.5,
       27.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       21.5,
       27.5
      ],
      "b": [
       21.5,
       11.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r5",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       21.5,
       11.5
      ],
      "b": [
       1.5,
       11.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r6",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       11.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "town/post/lamp",
     "geometry": {
      "t": "post",
      "c": [
       28.5,
       6.5
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  },
  "signature": {
   "v": 1,
   "world": "town",
   "slug": "",
   "title": "The funbox",
   "par": 3,
   "tee": [
    4.5,
    8.5
   ],
   "pin": [
    32.5,
    8.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       35.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       35.5,
       1.5
      ],
      "b": [
       35.5,
       15.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       35.5,
       15.5
      ],
      "b": [
       1.5,
       15.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       15.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "town/slope/funbox",
     "geometry": {
      "t": "rect",
      "min": [
       15.5,
       5.5
      ],
      "max": [
       20.5,
       10.5
      ]
     },
     "params": {
      "grade": 0.2,
      "dir": [
       1,
       0
      ]
     },
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  }
 },
 "mountain": {
  "straight": {
   "v": 1,
   "world": "mountain",
   "slug": "",
   "title": "Straight",
   "par": 2,
   "tee": [
    4.5,
    7.5
   ],
   "pin": [
    30.5,
    7.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       33.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       33.5,
       1.5
      ],
      "b": [
       33.5,
       13.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       33.5,
       13.5
      ],
      "b": [
       1.5,
       13.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       13.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "mountain/post/pine",
     "geometry": {
      "t": "post",
      "c": [
       14.5,
       5
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p2",
     "entry": "mountain/post/boulder",
     "geometry": {
      "t": "post",
      "c": [
       20.5,
       10
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  },
  "dogleg": {
   "v": 1,
   "world": "mountain",
   "slug": "",
   "title": "Dogleg",
   "par": 3,
   "tee": [
    4.5,
    6.5
   ],
   "pin": [
    26.5,
    23.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       31.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       31.5,
       1.5
      ],
      "b": [
       31.5,
       27.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       31.5,
       27.5
      ],
      "b": [
       21.5,
       27.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       21.5,
       27.5
      ],
      "b": [
       21.5,
       11.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r5",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       21.5,
       11.5
      ],
      "b": [
       1.5,
       11.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r6",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       11.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "mountain/post/pine",
     "geometry": {
      "t": "post",
      "c": [
       28.5,
       6.5
      ],
      "r": 0.8
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  },
  "signature": {
   "v": 1,
   "world": "mountain",
   "slug": "",
   "title": "The kicker",
   "par": 3,
   "tee": [
    4.5,
    8.5
   ],
   "pin": [
    32.5,
    8.5
   ],
   "pieces": [
    {
     "id": "r1",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       1.5
      ],
      "b": [
       35.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r2",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       35.5,
       1.5
      ],
      "b": [
       35.5,
       15.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r3",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       35.5,
       15.5
      ],
      "b": [
       1.5,
       15.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "r4",
     "entry": "*/rail/",
     "geometry": {
      "t": "rail",
      "a": [
       1.5,
       15.5
      ],
      "b": [
       1.5,
       1.5
      ]
     },
     "params": {},
     "clock": {
      "k": "fixed"
     }
    },
    {
     "id": "p1",
     "entry": "mountain/slope/kicker",
     "geometry": {
      "t": "rect",
      "min": [
       15.5,
       5.5
      ],
      "max": [
       20.5,
       10.5
      ]
     },
     "params": {
      "grade": 0.2,
      "dir": [
       1,
       0
      ]
     },
     "clock": {
      "k": "fixed"
     }
    }
   ],
   "pulses": [],
   "note": "",
   "proofs": []
  }
 }
};
