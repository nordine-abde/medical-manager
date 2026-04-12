fix those bugs:

you can run the stack, check the db. Make sure every thing work at the end
# 1) Error saving prescription

When saving prescription with 

prescriptionType:"visit" or prescriptionType:"therapy"

i get the error:

status 422
```json
{
  "type": "validation",
  "on": "body",
  "property": "/prescriptionType",
  "message": "Expected union value",
  "summary": "Property 'prescriptionType' should be one of: 'string', 'string', 'string'",
  "expected": {
    "prescriptionType": "exam"
  },
  "found": {
    "expirationDate": null,
    "issueDate": null,
    "notes": "Visita diabetologica",
    "prescriptionType": "visit",
    "status": "needed",
    "taskId": null
  },
  "errors": [
    {
      "type": 62,
      "schema": {
        "anyOf": [
          {
            "const": "exam",
            "type": "string"
          },
          {
            "const": "specialist_visit",
            "type": "string"
          },
          {
            "const": "medication",
            "type": "string"
          }
        ]
      },
      "path": "/prescriptionType",
      "value": "visit",
      "message": "Expected union value",
      "errors": [
        {
          "iterator": {}
        },
        {
          "iterator": {}
        },
        {
          "iterator": {}
        }
      ],
      "summary": "Property 'prescriptionType' should be one of: 'string', 'string', 'string'"
    }
  ]
}
```

Identify cause of the bug and fix then add a test that tests that all prescriptionTypes are accepted

# 2) Missing document when creating prescription

Every prescription has a relative "Ricetta" i want to be able to upload it when creating the prescription on the modal

Check if there is a document type prescription if missing add it

# 3) Additional field of ricetta

When saving a prescription i need a subtype field

example:

visita -> visita diabetologica / endocrinologica
esame -> sangue/urine/feci..
farmaco -> tachipirina, oki...

subtypes should be saved, when creating a new prescription i should be able to choose one from the previously used or create a new subtype

# 3) When creating a prescription i should be able to add a task in the same module

Example: I register the prescription -> add task "book the prescription"

