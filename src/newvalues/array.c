

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


void fus_array_set_len(fus_array_t *array, fus_array_len_t new_len){
    fus_class_t *class = array->class;
    fus_core_t *core = class->core;
    size_t elem_size = class->instance_size;

    fprintf(stderr, "%s: WARNING: Reallocating array so size == len. "
        "TODO: move to the usual \"double allocated size until >= len\" "
        "approach.\n",
        __func__);
    size_t new_size = new_len * elem_size;
    char *new_elems = fus_realloc(core, array->elems, new_size);

    for(int i = array->len; i < new_len; i++){
        void *elem = new_elems + i * elem_size;
        fus_class_instance_init(class, elem);
    }
    for(int i = array->len - 1; i >= new_len; i--){
        void *elem = new_elems + i * elem_size;
        fus_class_instance_cleanup(class, elem);
    }

    array->elems = new_elems;
    array->size = new_size;
    array->len = new_len;
}

