
#include <stdbool.h>

#include "array.h"


void fus_array_init(fus_array_t *array, fus_class_t *class){
    array->class = class;
    array->elems = NULL;
    array->len = 0;
    array->size = 0;
}

void fus_array_cleanup(fus_array_t *array){
    fus_class_t *class = array->class;
    size_t elem_size = class->instance_size;
    for(int i = 0; i < array->len; i++){
        void *elem = array->elems + i * elem_size;
        fus_class_instance_cleanup(class, elem);
    }
    fus_free(class->core, array->elems);
}


void fus_array_copy(fus_array_t *array, fus_array_t *other_array){
    array->class = other_array->class;
    array->elems = NULL;
    array->len = other_array->len;
    array->size = other_array->size;
    if(array->size != 0){
        array->elems = fus_malloc(array->class->core, array->size);
        fus_memcpy(array->class->core,
            array->elems, other_array->elems, array->size);
    }
}


static void fus_array_grow(fus_array_t *array, fus_array_len_t new_len,
    bool do_init
){
    fus_class_t *class = array->class;
    fus_core_t *core = class->core;
    size_t elem_size = class->instance_size;

    /* Grow allocated memory as needed. */
    size_t new_size_min = new_len * elem_size;
    size_t new_size = array->size;
    if(new_size == 0)new_size = new_size_min;
    while(new_size < new_size_min)new_size *= 2;
    if(new_size != array->size){
        char *new_elems = fus_realloc(core, array->elems, new_size);
        array->elems = new_elems;
        array->size = new_size;
    }

    if(do_init){
        /* Init elems whose indices will now be within array's bounds */
        char *elems = array->elems;
        for(int i = array->len; i < new_len; i++){
            void *elem = elems + i * elem_size;
            fus_class_instance_init(class, elem);
        }
    }

    /* Set array->len */
    array->len = new_len;
}

static void fus_array_shrink(fus_array_t *array, fus_array_len_t new_len,
    bool do_cleanup
){
    fus_class_t *class = array->class;
    fus_core_t *core = class->core;
    size_t elem_size = class->instance_size;

    /* Shrink allocated memory as needed. */
    /* NOTE: We currently never shrink allocated memory!
    It would make sense to add an option for this.
    On class? On core? Compile-time option? Hmm */

    if(do_cleanup){
        /* Cleanup elems whose indices will be out of array's bounds */
        char *elems = array->elems;
        for(int i = array->len - 1; i >= new_len; i--){
            void *elem = elems + i * elem_size;
            fus_class_instance_cleanup(class, elem);
        }
    }

    /* Set array->len */
    array->len = new_len;
}

void fus_array_set_len(fus_array_t *array, fus_array_len_t new_len){
    if(new_len > array->len){
        fus_array_grow(array, new_len, true);
    }else if(new_len < array->len){
        fus_array_shrink(array, new_len, true);
    }
}

void fus_array_push(fus_array_t *array){
    /* We pass do_init=false, caller is expected to poke a value
    into new last element.
    TODO: That should probably be handled by this function */
    fus_array_grow(array, array->len + 1, false);
}

void fus_array_pop(fus_array_t *array){
    /* We pass do_cleanup=false, caller is expected to take ownership
    of last element.
    TODO: That should probably be handled by this function */
    fus_array_shrink(array, array->len - 1, false);
}



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_array(fus_class_t *class, void *ptr){
    fus_array_t *array = ptr;
    fus_array_init(array, NULL);
        /* WARNING: we're passing a NULL class to the array...
        caller should re-initialize array ASAP with a valid
        class...
        is there a way to include the class of array elements
        in the array's class?..
        so have "array of T" classes...
        my god, though, it's getting too complex then... */
}

void fus_class_cleanup_array(fus_class_t *class, void *ptr){
    fus_array_t *array = ptr;
    fus_array_cleanup(array);
}
