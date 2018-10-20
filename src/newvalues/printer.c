
#include "includes.h"


#define FUS_PRINTER_LOG_UNEXPECTED_VALUE(VM, VALUE) { \
    fus_vm_t *vm = (VM); \
    fus_value_t value = (VALUE); \
    fprintf(stderr, "%s: WARNING: unexpected value: ", __func__); \
    fus_value_fprint(vm, value, stderr); \
    fprintf(stderr, "\n"); \
}

#define FUS_PRINTER_LOG_UNEXPECTED_BOXED(BOXED) { \
    fus_boxed_t *p = (BOXED); \
    fprintf(stderr, "%s: WARNING: unexpected boxed value: ", __func__); \
    fus_boxed_dump(p, stderr); \
    fprintf(stderr, "\n"); \
}



void fus_printer_init(fus_printer_t *printer, FILE *file){
    /* Initialize with reasonable defaults */
    printer->file = file;
    printer->depth = 0;
    printer->tab = "  ";
    printer->newline = "\n";
}

void fus_printer_cleanup(fus_printer_t *printer){
    /* Nuthin */
}


void fus_printer_print_tabs(fus_printer_t *printer){
    int depth = printer->depth;
    for(int i = 0; i < depth; i++){
        fprintf(printer->file, printer->tab);
    }
}

void fus_printer_print_newline(fus_printer_t *printer){
    fprintf(printer->file, printer->newline);
}




void fus_printer_print_value(fus_printer_t *printer,
    fus_vm_t *vm, fus_value_t value
){
    if(FUS_IS_BOXED(value)){
        fus_printer_print_boxed(printer, value.p);
        return;
    }

    FILE *file = printer->file;
    if(FUS_IS_NULL(value)){
        fprintf(file, "null");
    }else if(FUS_IS_TRUE(value)){
        fprintf(file, "T");
    }else if(FUS_IS_FALSE(value)){
        fprintf(file, "F");
    }else if(FUS_IS_INT(value)){
        fus_unboxed_t i = FUS_GET_PAYLOAD(value.i);
        fprintf(file, "%li", i);
    }else if(FUS_IS_SYM(value)){
        int sym_i = FUS_GET_PAYLOAD(value.i);
        fus_symtable_entry_t *entry = fus_symtable_get_entry(
            vm->symtable, sym_i);
        if(entry->is_name){
            fprintf(file, "`%s", entry->token);
        }else{
            fprintf(file, "(` %s)", entry->token);
        }
    }else if(FUS_IS_ERR(value)){
        fprintf(file, "err");
    }else{
        FUS_PRINTER_LOG_UNEXPECTED_VALUE(vm, value)
        fprintf(file, "(\"Got a weird value\" error)");
    }
}

void fus_printer_print_boxed(fus_printer_t *printer, fus_boxed_t *p){
    FILE *file = printer->file;
    fus_boxed_type_t type = p->type;
    if(type == FUS_BOXED_ARR){
        fprintf(file, "arr");

        fus_arr_t *a = &p->data.a;
        int len = a->values.len;
        fus_value_t *values = FUS_ARR_VALUES(*a);
        for(int i = 0; i < len; i++){
            fus_printer_print_newline(printer);

            printer->depth++;
            fus_printer_print_value(printer, p->vm, values[i]);
            printer->depth--;

            fprintf(file, ",");
        }
    }else if(type == FUS_BOXED_OBJ){
        fprintf(file, "obj");
    }else if(type == FUS_BOXED_STR){
        fprintf(file, "TODO: Implement printing of str");
    }else if(type == FUS_BOXED_FUN){
        fprintf(file, "fun(\"TODO: Implement printing of fun\" error)");
    }else{
        FUS_PRINTER_LOG_UNEXPECTED_BOXED(p)
        fprintf(file, "(\"Got weird boxed value\" error)");
    }
}

void fus_printer_print_data(fus_printer_t *printer,
    fus_vm_t *vm, fus_arr_t *a
){
    FILE *file = printer->file;

    int len = a->values.len;
    fus_value_t *values = FUS_ARR_VALUES(*a);
    for(int i = 0; i < len; i++){
        if(i != 0){
            fus_printer_print_newline(printer);
            fus_printer_print_tabs(printer);
        }

        fus_value_t value = values[i];
        if(FUS_IS_INT(value)){
            fus_unboxed_t i = FUS_GET_PAYLOAD(value.i);
            fprintf(file, "%li", i);
        }else if(FUS_IS_SYM(value)){
            int sym_i = FUS_GET_PAYLOAD(value.i);
            fus_symtable_entry_t *entry = fus_symtable_get_entry(
                vm->symtable, sym_i);
            fprintf(file, "%s", entry->token);
        }else if(FUS_IS_BOXED(value)){
            fus_boxed_t *p = value.p;
            fus_boxed_type_t type = p->type;
            if(type == FUS_BOXED_ARR){
                fprintf(file, ":");
                fus_printer_print_newline(printer);
                fus_printer_print_tabs(printer);
                printer->depth++;
                fus_printer_print_data(printer, vm, &p->data.a);
                printer->depth--;
            }else if(type == FUS_BOXED_STR){
                fprintf(file, "TODO: Implement printing of str");
            }else{
                FUS_PRINTER_LOG_UNEXPECTED_BOXED(p)
                fprintf(file, "<UNEXPECTED>");
            }
        }else{
            FUS_PRINTER_LOG_UNEXPECTED_VALUE(vm, value)
            fprintf(file, "<UNEXPECTED>");
        }
    }
}

