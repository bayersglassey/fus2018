

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


void fus_array_set_len(fus_array_t *array, fus_array_len_t new_len){
    fus_class_t *class = array->class;
    fus_core_t *core = class->core;
    size_t elem_size = class->instance_size;

    /* Grow allocated memory as needed.
    NOTE: We never shrink allocated memory!
    It would make sense to add an option for this... */
    size_t new_size_min = new_len * elem_size;
    size_t new_size = array->size;
    if(new_size == 0)new_size = new_size_min;
    while(new_size < new_size_min)new_size *= 2;
    if(new_size != array->size){
        char *new_elems = fus_realloc(core, array->elems, new_size);
        array->elems = new_elems;
        array->size = new_size;
    }

    char *elems = array->elems;
    for(int i = array->len; i < new_len; i++){
        void *elem = elems + i * elem_size;
        fus_class_instance_init(class, elem);
    }
    for(int i = array->len - 1; i >= new_len; i--){
        void *elem = elems + i * elem_size;
        fus_class_instance_cleanup(class, elem);
    }

    array->len = new_len;
}

