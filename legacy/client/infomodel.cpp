#include "infomodel.h"

infoModel::infoModel(QObject *parent) :
    QAbstractTableModel(parent)
{
    _cells.resize(rowOfTab);
    for(int i=0;i<rowOfTab;i++)
    {
        QVector<QString> vec(colOfTab);
        _cells[i]=vec;
    }
}

void infoModel::setCell(const QVector<QVector<QString> >& cells)
{
    beginResetModel();
    _cells=cells;
    endResetModel();
}


QVariant infoModel::data(const QModelIndex &index, int role) const
{
    //Q_UNUSED(role);
    if(role==Qt::DisplayRole)
    {
        int row=index.row();
        int col=index.column();
        return _cells[row][col];
    }
    else if (role == Qt::TextAlignmentRole)
    {
            return int(Qt::AlignHCenter | Qt::AlignVCenter);
    }
    return QVariant();//这挺重要,这个函数调用多次,用来显示数据的
}


int infoModel::rowCount(const QModelIndex &parent) const
{
    Q_UNUSED(parent);
    return rowOfTab;
}

int infoModel::columnCount(const QModelIndex &parent) const
{
    Q_UNUSED(parent);
    return colOfTab;
}
